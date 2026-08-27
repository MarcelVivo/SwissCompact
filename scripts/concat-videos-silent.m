#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 4) {
            fprintf(stderr, "Usage: concat-videos-silent <output> <input-1> <input-2> [...]\n");
            return 2;
        }

        NSString *outputPath = [NSString stringWithUTF8String:argv[1]];
        if ([[NSFileManager defaultManager] fileExistsAtPath:outputPath]) {
            fprintf(stderr, "Output already exists: %s\n", outputPath.UTF8String);
            return 2;
        }

        AVMutableComposition *composition = [AVMutableComposition composition];
        AVMutableCompositionTrack *targetTrack = [composition
            addMutableTrackWithMediaType:AVMediaTypeVideo
            preferredTrackID:kCMPersistentTrackID_Invalid];
        if (targetTrack == nil) {
            fprintf(stderr, "Unable to create the video composition track.\n");
            return 1;
        }

        CMTime insertionTime = kCMTimeZero;
        BOOL transformApplied = NO;

        for (int argumentIndex = 2; argumentIndex < argc; argumentIndex++) {
            NSString *inputPath = [NSString stringWithUTF8String:argv[argumentIndex]];
            AVURLAsset *asset = [AVURLAsset
                URLAssetWithURL:[NSURL fileURLWithPath:inputPath]
                options:nil];
            AVAssetTrack *sourceTrack = [asset tracksWithMediaType:AVMediaTypeVideo].firstObject;
            if (sourceTrack == nil) {
                fprintf(stderr, "No video track found in: %s\n", inputPath.UTF8String);
                return 1;
            }

            CMTimeRange sourceRange = CMTimeRangeMake(kCMTimeZero, asset.duration);
            NSError *insertError = nil;
            if (![targetTrack insertTimeRange:sourceRange
                                      ofTrack:sourceTrack
                                       atTime:insertionTime
                                        error:&insertError]) {
                fprintf(stderr, "Unable to insert %s: %s\n",
                        inputPath.UTF8String,
                        insertError.localizedDescription.UTF8String);
                return 1;
            }

            if (!transformApplied) {
                targetTrack.preferredTransform = sourceTrack.preferredTransform;
                transformApplied = YES;
            }
            insertionTime = CMTimeAdd(insertionTime, asset.duration);
        }

        AVAssetExportSession *exporter = [[AVAssetExportSession alloc]
            initWithAsset:composition
            presetName:AVAssetExportPresetHighestQuality];
        if (exporter == nil) {
            fprintf(stderr, "Unable to create the MP4 export session.\n");
            return 1;
        }

        exporter.outputURL = [NSURL fileURLWithPath:outputPath];
        exporter.outputFileType = AVFileTypeMPEG4;
        exporter.shouldOptimizeForNetworkUse = YES;

        dispatch_semaphore_t finished = dispatch_semaphore_create(0);
        [exporter exportAsynchronouslyWithCompletionHandler:^{
            dispatch_semaphore_signal(finished);
        }];
        dispatch_semaphore_wait(finished, DISPATCH_TIME_FOREVER);

        if (exporter.status != AVAssetExportSessionStatusCompleted) {
            fprintf(stderr, "Export failed: %s\n",
                    exporter.error.localizedDescription.UTF8String);
            return 1;
        }

        printf("Created silent %.3f s video at %s\n",
               CMTimeGetSeconds(composition.duration),
               outputPath.UTF8String);
        return 0;
    }
}

#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 4) {
            fprintf(stderr, "Usage: speed-video <input> <output> <speed>\n");
            return 2;
        }

        NSString *inputPath = [NSString stringWithUTF8String:argv[1]];
        NSString *outputPath = [NSString stringWithUTF8String:argv[2]];
        double speed = strtod(argv[3], NULL);
        if (speed <= 0) {
            fprintf(stderr, "Speed must be greater than zero.\n");
            return 2;
        }
        if ([[NSFileManager defaultManager] fileExistsAtPath:outputPath]) {
            fprintf(stderr, "Output already exists: %s\n", outputPath.UTF8String);
            return 2;
        }

        AVURLAsset *asset = [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:inputPath]
                                                options:nil];
        AVMutableComposition *composition = [AVMutableComposition composition];
        CMTime sourceDuration = asset.duration;
        CMTimeRange sourceRange = CMTimeRangeMake(kCMTimeZero, sourceDuration);
        __block BOOL insertedTrack = NO;

        for (AVMediaType mediaType in @[AVMediaTypeVideo, AVMediaTypeAudio]) {
            for (AVAssetTrack *sourceTrack in [asset tracksWithMediaType:mediaType]) {
                AVMutableCompositionTrack *targetTrack = [composition
                    addMutableTrackWithMediaType:mediaType
                    preferredTrackID:kCMPersistentTrackID_Invalid];
                NSError *insertError = nil;
                if (![targetTrack insertTimeRange:sourceRange
                                           ofTrack:sourceTrack
                                            atTime:kCMTimeZero
                                             error:&insertError]) {
                    fprintf(stderr, "Track insertion failed: %s\n",
                            insertError.localizedDescription.UTF8String);
                    return 1;
                }
                if ([mediaType isEqualToString:AVMediaTypeVideo]) {
                    targetTrack.preferredTransform = sourceTrack.preferredTransform;
                }
                insertedTrack = YES;
            }
        }

        if (!insertedTrack) {
            fprintf(stderr, "The source contains no video or audio tracks.\n");
            return 1;
        }

        CMTime targetDuration = CMTimeMultiplyByFloat64(sourceDuration, 1.0 / speed);
        [composition scaleTimeRange:sourceRange toDuration:targetDuration];

        AVAssetExportSession *exporter = [[AVAssetExportSession alloc]
            initWithAsset:composition
            presetName:AVAssetExportPresetHighestQuality];
        if (exporter == nil) {
            fprintf(stderr, "Unable to create MP4 export session.\n");
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

        printf("Created %.3f s video at %s\n",
               CMTimeGetSeconds(composition.duration),
               outputPath.UTF8String);
        return 0;
    }
}

import sharp from "sharp";

export type HeadlineConfiguration = {
  enabled: boolean;
  text: string;
  position: "top" | "center" | "bottom";
  align: "left" | "center" | "right";
  color: string;
  backdrop: boolean;
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character);
}

function safeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
}

function wrapText(value: string, maxCharacters: number, maxLines = 3): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1] || "";
    if (!current || `${current} ${word}`.length > maxCharacters) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
    if (lines.length > maxLines) {
      lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
      return lines.slice(0, maxLines);
    }
  }
  return lines.slice(0, maxLines);
}

export async function renderHeadline(
  image: Buffer,
  width: number,
  height: number,
  headline: HeadlineConfiguration,
): Promise<Buffer> {
  if (!headline.enabled || !headline.text.trim()) {
    return sharp(image).webp({ quality: 90 }).toBuffer();
  }

  const fontSize = Math.max(42, Math.round(Math.min(width, height) * 0.075));
  const lineHeight = Math.round(fontSize * 1.12);
  const horizontalPadding = Math.round(width * 0.08);
  const lines = wrapText(headline.text, Math.max(12, Math.floor((width - horizontalPadding * 2) / (fontSize * 0.58))));
  const textHeight = lines.length * lineHeight;
  const blockPadding = Math.round(fontSize * 0.45);
  const blockHeight = textHeight + blockPadding * 2;
  const blockY = headline.position === "top"
    ? Math.round(height * 0.08)
    : headline.position === "bottom"
      ? height - Math.round(height * 0.08) - blockHeight
      : Math.round((height - blockHeight) / 2);
  const x = headline.align === "left" ? horizontalPadding : headline.align === "right" ? width - horizontalPadding : width / 2;
  const anchor = headline.align === "left" ? "start" : headline.align === "right" ? "end" : "middle";
  const textY = blockY + blockPadding + fontSize;
  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("");
  const backdrop = headline.backdrop
    ? `<rect x="${Math.round(width * 0.035)}" y="${blockY}" width="${Math.round(width * 0.93)}" height="${blockHeight}" rx="${Math.round(fontSize * 0.25)}" fill="#000000" fill-opacity="0.48"/>`
    : "";
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${backdrop}
    <text x="${x}" y="${textY}" text-anchor="${anchor}" fill="${safeColor(headline.color)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" stroke="#000000" stroke-opacity="0.22" stroke-width="${Math.max(1, Math.round(fontSize * 0.025))}" paint-order="stroke">${tspans}</text>
  </svg>`);

  return sharp(image).composite([{ input: overlay, top: 0, left: 0 }]).webp({ quality: 90 }).toBuffer();
}

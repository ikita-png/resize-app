import { useState } from "react";
import { Download, ExternalLink, Check, Copy, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface ProcessedImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

interface ResultPreviewProps {
  originalImages: string[];
  processedImages: ProcessedImage[];
  isLoading?: boolean;
}

export default function ResultPreview({
  originalImages,
  processedImages,
  isLoading = false,
}: ResultPreviewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showComparison, setShowComparison] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  const downloadMutation = trpc.image.download.useMutation();

  const handleDownload = async (url: string, index: number) => {
    setDownloading(index);
    try {
      // Use server-side proxy to download the image (avoids CORS issues)
      const result = await downloadMutation.mutateAsync({ url });

      // Convert data URL to blob and download
      const response = await fetch(result.data);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `processed-image-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      toast.success("画像をダウンロードしました");
    } catch (error) {
      console.error("Download error:", error);
      // Fallback: open in new tab
      window.open(url, "_blank");
      toast.info("新しいタブで開きました - 右クリックで保存してください");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAll = async () => {
    for (let i = 0; i < processedImages.length; i++) {
      await handleDownload(processedImages[i].url, i);
      // Small delay between downloads
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URLをコピーしました");
  };

  if (processedImages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" />
            処理結果
          </CardTitle>
          <div className="flex items-center gap-2">
            {originalImages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowComparison(!showComparison)}
              >
                <ArrowLeftRight className="w-4 h-4 mr-1" />
                {showComparison ? "非表示" : "比較"}
              </Button>
            )}
            {processedImages.length > 1 && (
              <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                <Download className="w-4 h-4 mr-1" />
                すべてダウンロード
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Preview */}
        <div className="relative rounded-lg overflow-hidden bg-secondary/30">
          {isLoading ? (
            <div className="aspect-video flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">画像を処理中...</p>
              </div>
            </div>
          ) : showComparison && originalImages[selectedIndex] ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <img
                  src={originalImages[selectedIndex]}
                  alt="オリジナル"
                  className="w-full h-auto rounded-lg"
                />
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white">
                  元画像
                </div>
              </div>
              <div className="relative">
                <img
                  src={processedImages[selectedIndex]?.url}
                  alt="処理済み"
                  className="w-full h-auto rounded-lg"
                />
                <div className="absolute top-2 left-2 px-2 py-1 bg-primary/80 rounded text-xs text-white">
                  処理済み
                </div>
              </div>
            </div>
          ) : (
            <img
              src={processedImages[selectedIndex]?.url}
              alt="処理済み"
              className="w-full h-auto"
            />
          )}
        </div>

        {/* Image Info & Actions */}
        {processedImages[selectedIndex] && (
          <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
            <div className="text-sm">
              {processedImages[selectedIndex].width && processedImages[selectedIndex].height && (
                <span className="text-muted-foreground">
                  {processedImages[selectedIndex].width} × {processedImages[selectedIndex].height}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyUrl(processedImages[selectedIndex].url)}
              >
                <Copy className="w-4 h-4 mr-1" />
                URLコピー
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(processedImages[selectedIndex].url, "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                開く
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleDownload(processedImages[selectedIndex].url, selectedIndex)}
                disabled={downloading === selectedIndex}
              >
                {downloading === selectedIndex ? (
                  <>
                    <div className="w-4 h-4 mr-1 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ダウンロード中...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-1" />
                    ダウンロード
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Thumbnail Grid */}
        {processedImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {processedImages.map((img, index) => (
              <button
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${selectedIndex === index
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent hover:border-primary/50"
                  }`}
              >
                <img
                  src={img.url}
                  alt={`結果 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white">
                  {index + 1}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

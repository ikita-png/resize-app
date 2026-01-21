import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Wand2,
  Image as ImageIcon,
} from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import ProcessingOptions, {
  ProcessingOptionsData,
  PRESET_RATIOS,
  CustomRatio,
} from "@/components/ProcessingOptions";
import ResultPreview from "@/components/ResultPreview";

// Helper to upload file to S3 and get URL
async function uploadFileToS3(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.readAsDataURL(file);
  });
}

interface ProcessedResultItem {
  aspectRatio: string;
  aspectRatioLabel: string;
  images: Array<{ url: string; width?: number | null; height?: number | null }>;
}

export default function Home() {
  const [images, setImages] = useState<File[]>([]);
  const [options, setOptions] = useState<ProcessingOptionsData>({
    selectedRatios: ["16:9"], // デフォルトでX投稿用を選択
    customRatios: [],
    resolution: "1K",
    outputFormat: "png",
    prompt: "",
    notifyOnComplete: false,
  });
  const [processedResults, setProcessedResults] = useState<ProcessedResultItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingRatio, setCurrentProcessingRatio] = useState<string | null>(null);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });

  // キューステータスを取得（5秒ごとに更新）
  const { data: queueStatus } = trpc.image.queueStatus.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const processMutation = trpc.image.process.useMutation();

  const originalImageUrls = useMemo(() => {
    return images.map((img) => URL.createObjectURL(img));
  }, [images]);

  // Get all aspect ratios to process
  const getAspectRatiosToProcess = () => {
    const ratios: { value: string; label: string }[] = [];

    // Add selected preset ratios
    for (const ratio of options.selectedRatios) {
      const preset = PRESET_RATIOS.find((r) => r.value === ratio);
      if (preset) {
        ratios.push({ value: preset.value, label: `${preset.label} (${preset.description})` });
      }
    }

    // Add custom ratios
    for (const customRatio of options.customRatios) {
      const value = `${customRatio.width}:${customRatio.height}`;
      ratios.push({ value, label: `${value} (カスタム)` });
    }

    return ratios;
  };

  const handleProcess = async () => {
    if (images.length === 0) {
      toast.error("画像を1枚以上アップロードしてください");
      return;
    }

    const ratiosToProcess = getAspectRatiosToProcess();
    if (ratiosToProcess.length === 0) {
      toast.error("アスペクト比を1つ以上選択してください");
      return;
    }

    setIsProcessing(true);
    setProcessedResults([]);
    setProcessProgress({ current: 0, total: ratiosToProcess.length });

    try {
      // Convert files to data URLs
      const imageUrls = await Promise.all(images.map(uploadFileToS3));
      const results: ProcessedResultItem[] = [];

      // Process each aspect ratio
      for (let i = 0; i < ratiosToProcess.length; i++) {
        const ratio = ratiosToProcess[i];
        setCurrentProcessingRatio(ratio.label);
        setProcessProgress({ current: i + 1, total: ratiosToProcess.length });

        try {
          const result = await processMutation.mutateAsync({
            imageUrls,
            prompt: options.prompt || undefined,
            aspectRatio: ratio.value,
            resolution: options.resolution as "1K" | "2K" | "4K",
            outputFormat: options.outputFormat as "jpeg" | "png" | "webp",
            notifyOnComplete: options.notifyOnComplete && i === ratiosToProcess.length - 1, // Only notify on last one
          });

          results.push({
            aspectRatio: ratio.value,
            aspectRatioLabel: ratio.label,
            images: result.images,
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : "不明なエラー";
          toast.error(`${ratio.label} の処理に失敗: ${errorMessage}`);
        }
      }

      setProcessedResults(results);
      if (results.length > 0) {
        toast.success(`${results.length}種類のアスペクト比で処理が完了しました！`);
      }
    } catch (error) {
      toast.error("画像の準備に失敗しました");
    } finally {
      setIsProcessing(false);
      setCurrentProcessingRatio(null);
    }
  };

  const totalImagesToGenerate = getAspectRatiosToProcess().length * images.length;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">画像リサイズツール</h1>
                <p className="text-xs text-muted-foreground">
                  複数アスペクト比で一括生成
                </p>
              </div>
            </div>
            {/* Queue Status */}
            {queueStatus && (queueStatus.queueLength > 0 || queueStatus.processingCount > 0) && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/80 rounded-full text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-muted-foreground">
                  処理中: {queueStatus.processingCount}/{queueStatus.maxConcurrent}
                  {queueStatus.queueLength > 0 && ` | 待機: ${queueStatus.queueLength}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Full Height Split Layout */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-2">
          {/* Left Column - Scrollable Upload & Options */}
          <div className="overflow-y-auto border-r border-border/30">
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">画像をアップロード</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  リサイズしたい画像を選択（最大5枚）
                </p>
                <ImageUploader
                  images={images}
                  onImagesChange={setImages}
                  maxImages={5}
                  disabled={isProcessing}
                />
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-2">処理オプション</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  複数のアスペクト比を選択して一括生成
                </p>
                <ProcessingOptions
                  options={options}
                  onOptionsChange={setOptions}
                  disabled={isProcessing}
                />
              </div>

              <Button
                onClick={handleProcess}
                disabled={images.length === 0 || getAspectRatiosToProcess().length === 0 || isProcessing}
                className="w-full h-14 text-lg glow"
                size="lg"
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      処理中... ({processProgress.current}/{processProgress.total})
                    </div>
                    {currentProcessingRatio && (
                      <span className="text-xs opacity-80 mt-1">
                        {currentProcessingRatio}
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    {totalImagesToGenerate > 0
                      ? `${totalImagesToGenerate}枚の画像を生成`
                      : "画像を処理する"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Right Column - Scrollable Results */}
          <div className="overflow-y-auto bg-muted/20">
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">処理結果</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  各アスペクト比ごとの処理結果
                </p>
              </div>

              {processedResults.length > 0 ? (
                <div className="space-y-6">
                  {processedResults.map((result, index) => (
                    <div key={index} className="space-y-2">
                      <h3 className="text-lg font-semibold text-primary">
                        {result.aspectRatioLabel}
                      </h3>
                      <ResultPreview
                        originalImages={originalImageUrls}
                        processedImages={result.images}
                        isLoading={false}
                      />
                    </div>
                  ))}
                </div>
              ) : isProcessing ? (
                <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-muted-foreground">画像を処理しています...</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {currentProcessingRatio && `現在: ${currentProcessingRatio}`}
                  </p>
                  <div className="mt-4 w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(processProgress.current / processProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {processProgress.current} / {processProgress.total} 完了
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/50 bg-card/30 p-12 text-center">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                  <p className="text-muted-foreground">
                    画像をアップロードしてアスペクト比を選択
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    プリセットとカスタム比率を組み合わせて一括生成できます
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

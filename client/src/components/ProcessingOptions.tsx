import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ratio, Maximize, FileImage, Sparkles, Bell, Check, Plus, X } from "lucide-react";

// Preset aspect ratios with labels - SNS・Web広告向け
export const PRESET_RATIOS = [
  { value: "16:9", label: "16:9", description: "X (Twitter) 投稿" },
  { value: "9:16", label: "9:16", description: "インスタ ストーリーズ" },
  { value: "4:5", label: "4:5", description: "インスタ フィード投稿" },
  { value: "1:1", label: "1:1", description: "Web広告 正方形バナー" },
  { value: "1:2", label: "1:2", description: "Web広告 縦長バナー" },
  { value: "191:100", label: "1.91:1", description: "Web広告 横長バナー" },
] as const;

const RESOLUTIONS = [
  { value: "1K", label: "1K", description: "1024px" },
  { value: "2K", label: "2K", description: "2048px" },
  { value: "4K", label: "4K", description: "4096px（2倍コスト）" },
] as const;

const OUTPUT_FORMATS = [
  { value: "png", label: "PNG", description: "ロスレス" },
  { value: "jpeg", label: "JPEG", description: "圧縮" },
  { value: "webp", label: "WebP", description: "モダン" },
] as const;

export interface CustomRatio {
  id: string;
  width: string;
  height: string;
}

export interface ProcessingOptionsData {
  selectedRatios: string[];
  customRatios: CustomRatio[];
  resolution: string;
  outputFormat: string;
  prompt: string;
  notifyOnComplete: boolean;
}

interface ProcessingOptionsProps {
  options: ProcessingOptionsData;
  onOptionsChange: (options: ProcessingOptionsData) => void;
  disabled?: boolean;
}

export default function ProcessingOptions({
  options,
  onOptionsChange,
  disabled = false,
}: ProcessingOptionsProps) {
  const [newCustomWidth, setNewCustomWidth] = useState("");
  const [newCustomHeight, setNewCustomHeight] = useState("");

  const updateOption = <K extends keyof ProcessingOptionsData>(
    key: K,
    value: ProcessingOptionsData[K]
  ) => {
    onOptionsChange({ ...options, [key]: value });
  };

  const toggleRatio = (ratio: string) => {
    const current = options.selectedRatios;
    if (current.includes(ratio)) {
      updateOption("selectedRatios", current.filter((r) => r !== ratio));
    } else {
      updateOption("selectedRatios", [...current, ratio]);
    }
  };

  const selectAllRatios = () => {
    updateOption("selectedRatios", PRESET_RATIOS.map((r) => r.value));
  };

  const clearAllRatios = () => {
    updateOption("selectedRatios", []);
  };

  const addCustomRatio = () => {
    if (!newCustomWidth || !newCustomHeight) return;

    const width = parseInt(newCustomWidth);
    const height = parseInt(newCustomHeight);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return;

    const newRatio: CustomRatio = {
      id: `custom-${Date.now()}`,
      width: newCustomWidth,
      height: newCustomHeight,
    };

    updateOption("customRatios", [...options.customRatios, newRatio]);
    setNewCustomWidth("");
    setNewCustomHeight("");
  };

  const removeCustomRatio = (id: string) => {
    updateOption("customRatios", options.customRatios.filter((r) => r.id !== id));
  };

  const getTotalSelectedCount = () => {
    return options.selectedRatios.length + options.customRatios.length;
  };

  return (
    <div className="space-y-6">
      {/* Aspect Ratio Section - Multiple Selection */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ratio className="w-4 h-4 text-primary" />
              アスペクト比（複数選択可）
            </CardTitle>
            <div className="flex gap-2">
              <button
                onClick={selectAllRatios}
                disabled={disabled}
                className="text-xs text-primary hover:underline"
              >
                すべて選択
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                onClick={clearAllRatios}
                disabled={disabled}
                className="text-xs text-muted-foreground hover:underline"
              >
                クリア
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            選択したすべてのアスペクト比で画像を生成します（{getTotalSelectedCount()}個選択中）
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset Ratios Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRESET_RATIOS.map((ratio) => {
              const isSelected = options.selectedRatios.includes(ratio.value);
              return (
                <button
                  key={ratio.value}
                  onClick={() => toggleRatio(ratio.value)}
                  disabled={disabled}
                  className={`relative p-4 rounded-lg border text-left transition-all ${isSelected
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50 hover:bg-secondary/50"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                  <div className="font-bold text-lg">{ratio.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {ratio.description}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Ratios Section */}
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">カスタム比率</Label>
              <span className="text-xs text-muted-foreground">
                {options.customRatios.length}個追加済み
              </span>
            </div>

            {/* Existing Custom Ratios */}
            {options.customRatios.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {options.customRatios.map((ratio) => (
                  <div
                    key={ratio.id}
                    className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg"
                  >
                    <span className="font-medium text-primary">
                      {ratio.width}:{ratio.height}
                    </span>
                    <button
                      onClick={() => removeCustomRatio(ratio.id)}
                      disabled={disabled}
                      className="text-primary/60 hover:text-destructive transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Custom Ratio */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="100"
                value={newCustomWidth}
                onChange={(e) => setNewCustomWidth(e.target.value)}
                placeholder="幅"
                disabled={disabled}
                className="w-20"
              />
              <span className="text-xl text-muted-foreground">:</span>
              <Input
                type="number"
                min="1"
                max="100"
                value={newCustomHeight}
                onChange={(e) => setNewCustomHeight(e.target.value)}
                placeholder="高さ"
                disabled={disabled}
                className="w-20"
              />
              <Button
                onClick={addCustomRatio}
                disabled={disabled || !newCustomWidth || !newCustomHeight}
                size="sm"
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-1" />
                追加
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              例: 幅「3」高さ「2」で 3:2 の比率を追加
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Resolution & Format */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Maximize className="w-4 h-4 text-primary" />
              解像度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={options.resolution}
              onValueChange={(v) => updateOption("resolution", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((res) => (
                  <SelectItem key={res.value} value={res.value}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{res.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {res.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileImage className="w-4 h-4 text-primary" />
              出力形式
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={options.outputFormat}
              onValueChange={(v) => updateOption("outputFormat", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_FORMATS.map((fmt) => (
                  <SelectItem key={fmt.value} value={fmt.value}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{fmt.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {fmt.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* AI Prompt */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI編集プロンプト
            <span className="text-xs font-normal text-muted-foreground ml-1">
              （任意）
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={options.prompt}
            onChange={(e) => updateOption("prompt", e.target.value)}
            placeholder="画像の編集内容を説明してください...（例：「背景を夕焼けに変更」「虹を追加」「ビンテージ風にする」）"
            rows={3}
            disabled={disabled}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground mt-2">
            空欄の場合は単純なリサイズのみ。AI編集をしたい場合は指示を入力
          </p>
        </CardContent>
      </Card>

      {/* Notification Toggle */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-primary" />
              <div>
                <Label htmlFor="notify" className="text-sm font-medium">
                  完了時に通知
                </Label>
                <p className="text-xs text-muted-foreground">
                  処理完了時に通知を受け取る
                </p>
              </div>
            </div>
            <Switch
              id="notify"
              checked={options.notifyOnComplete}
              onCheckedChange={(v) => updateOption("notifyOnComplete", v)}
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cost Estimate */}
      {getTotalSelectedCount() > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">予想生成枚数:</span>
              <span className="font-bold text-primary">
                {getTotalSelectedCount()} 枚
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-1">
                {options.selectedRatios.map((ratio) => {
                  const preset = PRESET_RATIOS.find((r) => r.value === ratio);
                  return (
                    <span key={ratio} className="px-2 py-0.5 bg-secondary rounded">
                      {preset?.label || ratio}
                    </span>
                  );
                })}
                {options.customRatios.map((ratio) => (
                  <span key={ratio.id} className="px-2 py-0.5 bg-primary/20 rounded text-primary">
                    {ratio.width}:{ratio.height}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ※ アップロードした各画像に対して、選択したアスペクト比の数だけ画像が生成されます
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

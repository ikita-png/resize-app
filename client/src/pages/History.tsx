import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Image as ImageIcon,
  Download,
  ExternalLink,
  Wand2,
  LogIn,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function History() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { data: history, isLoading } = trpc.image.history.useQuery(
    { limit: 50 },
    { enabled: isAuthenticated }
  );

  const handleDownload = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `processed-image-${index + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      toast.success("Image downloaded");
    } catch (error) {
      toast.error("Failed to download image");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="default" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Sign in to view history</h2>
          <Button asChild>
            <a href={getLoginUrl()}>
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">Processing History</h1>
                <p className="text-xs text-muted-foreground">
                  View your past image processing jobs
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-16">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="text-xl font-semibold mb-2">No processing history</h2>
            <p className="text-muted-foreground mb-6">
              Start processing images to see your history here
            </p>
            <Link href="/">
              <Button>
                <Wand2 className="w-4 h-4 mr-2" />
                Process Images
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {history.map((job) => (
              <Card key={job.id} className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">Job #{job.id}</CardTitle>
                      {getStatusBadge(job.status)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(job.createdAt), "MMM d, yyyy HH:mm")}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Job Details */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Aspect Ratio:</span>{" "}
                      <span className="font-medium">{job.aspectRatio}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Resolution:</span>{" "}
                      <span className="font-medium">{job.resolution}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Format:</span>{" "}
                      <span className="font-medium uppercase">{job.outputFormat}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Images:</span>{" "}
                      <span className="font-medium">{job.imageCount}</span>
                    </div>
                  </div>

                  {/* Prompt */}
                  {job.prompt && (
                    <div className="p-3 bg-secondary/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Prompt:</p>
                      <p className="text-sm">{job.prompt}</p>
                    </div>
                  )}

                  {/* Error Message */}
                  {job.errorMessage && (
                    <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                      <p className="text-sm text-destructive">{job.errorMessage}</p>
                    </div>
                  )}

                  {/* Images Comparison */}
                  {job.status === "completed" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Original Images */}
                      <div>
                        <p className="text-sm font-medium mb-2 text-muted-foreground">
                          Original ({job.originalImages.length})
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {job.originalImages.map((img, idx) => (
                            <div
                              key={idx}
                              className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-secondary"
                            >
                              <img
                                src={img.url}
                                alt={`Original ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Processed Images */}
                      <div>
                        <p className="text-sm font-medium mb-2 text-muted-foreground">
                          Processed ({job.processedImages.length})
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {job.processedImages.map((img, idx) => (
                            <div
                              key={idx}
                              className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-secondary group"
                            >
                              <img
                                src={img.url}
                                alt={`Processed ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 text-white hover:text-white hover:bg-white/20"
                                  onClick={() => handleDownload(img.url, idx)}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 text-white hover:text-white hover:bg-white/20"
                                  onClick={() => window.open(img.url, "_blank")}
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

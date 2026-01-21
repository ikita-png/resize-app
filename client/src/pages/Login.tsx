import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wand2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface LoginProps {
    onLoginSuccess: () => void;
}

import ReCAPTCHA from "react-google-recaptcha";

export default function Login({ onLoginSuccess }: LoginProps) {
    const [password, setPassword] = useState("");
    const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Check if reCAPTCHA key is configured
    const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

    const loginMutation = trpc.auth.loginWithPassword.useMutation({
        onSuccess: () => {
            toast.success("ログインしました");
            onLoginSuccess();
        },
        onError: (error) => {
            toast.error(error.message || "パスワードが正しくありません");
        },
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!password.trim()) {
            toast.error("パスワードを入力してください");
            return;
        }

        // If reCAPTCHA is configured, require token
        if (recaptchaSiteKey && !recaptchaToken) {
            toast.error("「ロボットではありません」にチェックを入れてください");
            return;
        }

        setIsLoading(true);
        try {
            await loginMutation.mutateAsync({
                password,
                recaptchaToken: recaptchaToken || undefined
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-4">
                        <Wand2 className="w-8 h-8 text-primary-foreground" />
                    </div>
                    <CardTitle className="text-2xl font-bold">画像リサイズツール</CardTitle>
                    <CardDescription>
                        利用するにはパスワードを入力してください
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">アクセスパスワード</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="パスワードを入力"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10"
                                    disabled={isLoading}
                                    autoFocus
                                />
                            </div>
                        </div>

                        {recaptchaSiteKey && (
                            <div className="flex justify-center">
                                <ReCAPTCHA
                                    sitekey={recaptchaSiteKey}
                                    onChange={setRecaptchaToken}
                                    theme="light"
                                />
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading || !password.trim()}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ログイン中...
                                </>
                            ) : (
                                "ログイン"
                            )}
                        </Button>
                    </form>
                    <p className="text-xs text-center text-muted-foreground mt-4">
                        ※ パスワードは管理者にお問い合わせください
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

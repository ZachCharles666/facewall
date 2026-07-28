"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { prewarmDevRoutes } from "@/lib/dev/prewarm";
import type { VisualTheme } from "@/lib/types";

type GateStep =
  | "checking"
  | "credentials"
  | "otp"
  | "invite"
  | "consent"
  | "privacy"
  | "authenticated";

interface CurrentPolicy {
  policyVersion: string;
  title: string;
  content: string;
  scopes: string[];
  accepted: boolean;
  acceptedAt: string | null;
}

interface DeletionRequest {
  id: string;
  status: string;
  requestedAt: string;
  resolvedAt: string | null;
}

interface ApiFailure {
  error?: { code?: string; message?: string };
}

const errorMessages: Record<string, string> = {
  INPUT_INVALID: "请检查邮箱和邀请码格式。",
  INVITE_INVALID: "邀请码不可用，请向内测负责人确认。",
  INVITE_EXPIRED: "邀请码已过期，请向内测负责人申请新的邀请码。",
  INVITE_EXHAUSTED: "邀请码名额已用完，请向内测负责人确认。",
  OTP_RATE_LIMITED: "请求过于频繁，请稍后再试。",
  EMAIL_BUDGET_EXHAUSTED: "今日验证码额度已达上限，请稍后再试。",
  EMAIL_DELIVERY_FAILED: "验证码发送失败，请稍后重试。",
  OTP_INVALID_OR_EXPIRED: "验证码错误或已过期，请检查后重试。",
  PROFILE_INIT_FAILED: "内测资格激活未完成，请重试。",
  POLICY_VERSION_OUTDATED: "协议已更新，请重新阅读并确认当前版本。",
  PRIVACY_OPERATION_FAILED: "隐私操作暂时失败，请稍后重试。"
};

async function readFailure(response: Response) {
  const body = (await response.json().catch(() => ({}))) as ApiFailure;
  const code = body.error?.code || "UNKNOWN";
  return errorMessages[code] || body.error?.message || "请求失败，请稍后重试。";
}

export function AuthGate({
  enabled,
  visualTheme,
  children
}: {
  enabled: boolean;
  visualTheme: VisualTheme;
  children: ReactNode;
}) {
  const [step, setStep] = useState<GateStep>(enabled ? "checking" : "authenticated");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [token, setToken] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [message, setMessage] = useState("正在恢复登录状态…");
  const [busy, setBusy] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [policy, setPolicy] = useState<CurrentPolicy | null>(null);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);

  useEffect(() => {
    document.body.dataset.visualTheme = visualTheme;
    return () => {
      delete document.body.dataset.visualTheme;
    };
  }, [visualTheme]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (response.ok) {
          const body = (await response.json()) as {
            data?: {
              needsInvite?: boolean;
              needsConsent?: boolean;
              privacyOnly?: boolean;
            };
          };
          if (body.data?.needsInvite) {
            setStep("invite");
            setMessage("邮箱验证已完成，请输入邀请码开通内测体验资格。");
          } else if (body.data?.privacyOnly) {
            setStep("privacy");
            setMessage("删除申请正在处理，当前账号不能开始新的训练。");
          } else if (body.data?.needsConsent) {
            setStep("consent");
            setMessage("开始新训练前，请阅读并同意当前版本隐私说明。");
          } else {
            setStep("authenticated");
            setMessage("");
          }
        } else {
          setStep("credentials");
          setMessage("使用受邀邮箱进入 PassBuddy 内测。");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStep("credentials");
          setMessage("暂时无法恢复登录状态，请重新登录。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (step === "authenticated") {
      prewarmDevRoutes();
    }
  }, [step]);

  useEffect(() => {
    if (resendAfter <= 0) return;
    const timer = window.setInterval(() => {
      setResendAfter((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAfter]);

  useEffect(() => {
    if (step !== "consent" && step !== "privacy" && !showPrivacy) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/consent/current", { cache: "no-store" }).then((response) =>
        response.ok ? response.json() : Promise.reject(response)
      ),
      fetch("/api/privacy/deletion-requests", { cache: "no-store" }).then((response) =>
        response.ok ? response.json() : null
      )
    ])
      .then(([policyBody, deletionBody]) => {
        if (cancelled) return;
        setPolicy(policyBody.data as CurrentPolicy);
        setPolicyChecked(Boolean(policyBody.data?.accepted));
        setDeletionRequest((deletionBody?.data as DeletionRequest | null) ?? null);
      })
      .catch(() => {
        if (!cancelled) setMessage("隐私说明加载失败，请稍后重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [showPrivacy, step]);

  async function requestOtp(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setMessage("正在发送验证码…");
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!response.ok) {
        setMessage(await readFailure(response));
        return;
      }
      const body = (await response.json()) as {
        data: { challengeId: string; resendAfterSec: number };
      };
      setChallengeId(body.data.challengeId);
      setResendAfter(body.data.resendAfterSec);
      setToken("");
      setStep("otp");
      setMessage("验证码已发送，请检查收件箱和垃圾邮件。");
    } catch {
      setMessage("网络请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("正在验证…");
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token, challengeId })
      });
      if (!response.ok) {
        setMessage(await readFailure(response));
        return;
      }
      const body = (await response.json()) as {
        data: {
          needsInvite: boolean;
          needsConsent: boolean;
          privacyOnly?: boolean;
        };
      };
      if (body.data.needsInvite) {
        setStep("invite");
        setMessage("邮箱验证成功，请输入邀请码开通产品体验资格。");
      } else if (body.data.privacyOnly) {
        setStep("privacy");
        setMessage("删除申请正在处理，当前账号不能开始新的训练。");
      } else if (body.data.needsConsent) {
        setStep("consent");
        setMessage("登录成功。开始新训练前，请阅读并同意当前版本隐私说明。");
      } else {
        setStep("authenticated");
        setMessage("");
      }
    } catch {
      setMessage("网络请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function redeemInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("正在激活内测资格…");
    try {
      const response = await fetch("/api/auth/redeem-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteCode })
      });
      if (!response.ok) {
        setMessage(await readFailure(response));
        return;
      }
      const body = (await response.json()) as { data: { needsConsent: boolean } };
      if (body.data.needsConsent) {
        setStep("consent");
        setMessage("内测资格已激活。开始新训练前，请阅读并同意隐私说明。");
      } else {
        setStep("authenticated");
        setMessage("");
      }
    } catch {
      setMessage("网络请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function acceptConsent(event: FormEvent) {
    event.preventDefault();
    if (!policy || !policyChecked) return;
    setBusy(true);
    setMessage("正在保存同意记录…");
    try {
      const response = await fetch("/api/consent/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policyVersion: policy.policyVersion,
          scopes: policy.scopes,
          idempotencyKey: crypto.randomUUID()
        })
      });
      if (!response.ok) {
        setMessage(await readFailure(response));
        if (response.status === 409) setPolicy(null);
        return;
      }
      setStep("authenticated");
      setMessage("");
    } catch {
      setMessage("网络请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    if (
      !window.confirm(
        "提交后管理员会人工核验并执行删除。审批后账号将不能开始新训练，是否继续？"
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("正在提交删除申请…");
    try {
      const response = await fetch("/api/privacy/deletion-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() })
      });
      if (!response.ok) {
        setMessage(await readFailure(response));
        return;
      }
      const body = (await response.json()) as { data: DeletionRequest };
      setDeletionRequest(body.data);
      setMessage("删除申请已提交，管理员将按留痕流程处理。");
    } catch {
      setMessage("网络请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken("");
    setChallengeId("");
    setStep("credentials");
    setMessage("已退出登录。");
    setBusy(false);
  }

  if (step === "authenticated") {
    return (
      <>
        {enabled && (
          <div className="auth-session-bar">
            <span>PassBuddy 受控内测</span>
            <div className="auth-session-actions">
              <button
                disabled={busy}
                onClick={() => setShowPrivacy((current) => !current)}
                type="button"
              >
                隐私与数据
              </button>
              <button disabled={busy} onClick={logout} type="button">
                退出登录
              </button>
            </div>
          </div>
        )}
        {showPrivacy && (
          <section className="privacy-panel" aria-busy={busy}>
            <div className="privacy-panel-header">
              <div>
                <p className="auth-eyebrow">PRIVACY & DATA</p>
                <h2>{policy?.title || "正在加载隐私说明…"}</h2>
              </div>
              <button onClick={() => setShowPrivacy(false)} type="button">
                关闭
              </button>
            </div>
            {policy && (
              <>
                <div className="privacy-copy">
                  {policy.content.split("\n\n").map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                <p className="privacy-meta">
                  协议版本：{policy.policyVersion}
                  {policy.acceptedAt
                    ? ` · 已同意于 ${new Date(policy.acceptedAt).toLocaleString()}`
                    : ""}
                </p>
              </>
            )}
            <div className="privacy-danger-zone">
              <h3>删除我的内测数据</h3>
              {deletionRequest ? (
                <p>
                  申请状态：<strong>{deletionRequest.status}</strong> · 提交于{" "}
                  {new Date(deletionRequest.requestedAt).toLocaleString()}
                </p>
              ) : (
                <button disabled={busy} onClick={requestDeletion} type="button">
                  提交删除申请
                </button>
              )}
            </div>
            <p className="auth-message" role="status">
              {message}
            </p>
          </section>
        )}
        {children}
      </>
    );
  }

  return (
    <main className={`auth-shell theme-${visualTheme}`}>
      <section className="auth-card" aria-busy={busy}>
        <p className="auth-eyebrow">PASSBUDDY INTERNAL BETA</p>
        <h1>
          {step === "otp"
            ? "输入邮箱验证码"
            : step === "invite"
              ? "开通内测体验"
              : step === "consent"
                ? policy?.title || "阅读隐私说明"
                : step === "privacy"
                  ? "删除申请处理中"
              : "欢迎登录 PassBuddy"}
        </h1>
        <p className="auth-lead">
          {step === "otp"
            ? `验证码已发送至 ${email.trim().toLowerCase()}，30 分钟内有效。`
            : step === "invite"
              ? "账号注册/登录已完成。输入邀请码后，可获得 3 次完整面试体验。"
              : step === "consent"
                ? "同意当前版本后才能开始新的面试训练；你仍可退出或提交数据删除申请。"
                : step === "privacy"
                  ? "你仍可查看隐私说明和申请状态，或退出登录。"
              : "使用邮箱验证码注册或登录，无需设置密码。"}
        </p>

        {step === "checking" ? (
          <div className="auth-loading">正在检查 Session…</div>
        ) : step === "credentials" ? (
          <form className="auth-form" onSubmit={requestOtp}>
            <label>
              邮箱
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                required
                type="email"
                value={email}
              />
            </label>
            <button className="auth-primary" disabled={busy} type="submit">
              {busy ? "发送中…" : "发送验证码"}
            </button>
          </form>
        ) : step === "otp" ? (
          <form className="auth-form" onSubmit={verifyOtp}>
            <label>
              6 位验证码
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))}
                pattern="[0-9]{6}"
                placeholder="000000"
                required
                value={token}
              />
            </label>
            <button className="auth-primary" disabled={busy || token.length !== 6} type="submit">
              {busy ? "验证中…" : "验证并进入"}
            </button>
            <div className="auth-secondary-actions">
              <button
                disabled={busy || resendAfter > 0}
                onClick={() => void requestOtp()}
                type="button"
              >
                {resendAfter > 0 ? `${resendAfter} 秒后可重发` : "重新发送"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setStep("credentials");
                  setToken("");
                  setMessage("可修改邮箱或邀请码后重新发送。");
                }}
                type="button"
              >
                修改邮箱
              </button>
            </div>
          </form>
        ) : step === "invite" ? (
          <form className="auth-form" onSubmit={redeemInvite}>
            <label>
              内测邀请码
              <input
                autoComplete="off"
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="请输入内测邀请码"
                required
                value={inviteCode}
              />
            </label>
            <button className="auth-primary" disabled={busy} type="submit">
              {busy ? "激活中…" : "激活并进入产品"}
            </button>
            <button disabled={busy} onClick={logout} type="button">
              换一个邮箱登录
            </button>
          </form>
        ) : step === "consent" ? (
          <form className="auth-form" onSubmit={acceptConsent}>
            <div className="privacy-copy">
              {policy ? (
                policy.content.split("\n\n").map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))
              ) : (
                <p>正在从服务端加载当前协议版本…</p>
              )}
            </div>
            {policy && (
              <>
                <p className="privacy-meta">协议版本：{policy.policyVersion}</p>
                <label className="privacy-consent-check">
                  <input
                    checked={policyChecked}
                    onChange={(event) => setPolicyChecked(event.target.checked)}
                    type="checkbox"
                  />
                  我已阅读并同意当前版本隐私说明
                </label>
              </>
            )}
            <button
              className="auth-primary"
              disabled={busy || !policy || !policyChecked}
              type="submit"
            >
              {busy ? "保存中…" : "同意并进入产品"}
            </button>
            <div className="auth-secondary-actions">
              <button disabled={busy} onClick={requestDeletion} type="button">
                申请删除数据
              </button>
              <button disabled={busy} onClick={logout} type="button">
                退出登录
              </button>
            </div>
            {deletionRequest && (
              <p className="privacy-meta">删除申请状态：{deletionRequest.status}</p>
            )}
          </form>
        ) : (
          <div className="auth-form">
            <div className="privacy-copy">
              {policy ? (
                policy.content.split("\n\n").map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))
              ) : (
                <p>正在加载隐私说明和删除申请状态…</p>
              )}
            </div>
            <p className="privacy-meta">
              删除申请状态：{deletionRequest?.status || "正在查询"}
            </p>
            <button disabled={busy} onClick={logout} type="button">
              退出登录
            </button>
          </div>
        )}
        <p className="auth-message" role="status">
          {message}
        </p>
        <p className="auth-footnote">
          内测期间验证码暂设 30 分钟有效；重发后旧验证码立即失效，最多尝试 3 次。
        </p>
      </section>
    </main>
  );
}

"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { prewarmDevRoutes } from "@/lib/dev/prewarm";
import type { VisualTheme } from "@/lib/types";
import { JujuOrb } from "@/components/JujuOrb";
import emailIcon from "@/面壁者/email__350-986@2x.png";
import invitationCodeIcon from "@/面壁者/Invitation_code__350-1090@2x.png";
import verificationCodeIcon from "@/面壁者/Verification_code__350-992@2x.png";

type GateStep =
  | "checking"
  | "credentials"
  | "otp"
  | "invite"
  | "consent"
  | "privacy"
  | "authenticated";

type PolicyView = "terms" | "privacy";

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

const emphasizedPolicyParagraphPrefixes = [
  "2.1 AI生成内容性质说明",
  "4.2 退款规则",
  "5. 免责声明与责任限制",
  "5.1 服务中断",
  "5.2 面试结果免责",
  "6.2 法律适用与管辖"
];

function renderPolicyContent(content: string) {
  return content.split("\n\n").map((paragraph, index) => {
    const emphasized = emphasizedPolicyParagraphPrefixes.some((prefix) =>
      paragraph.startsWith(prefix)
    );
    return (
      <p key={`${index}-${paragraph.slice(0, 24)}`}>
        {emphasized ? <strong>{paragraph}</strong> : paragraph}
      </p>
    );
  });
}

function getPolicyViewContent(content: string, view: PolicyView) {
  const termsMarker = "一、 用户服务协议";
  const privacyMarker = "二、 隐私政策";
  const termsStart = content.indexOf(termsMarker);
  const privacyStart = content.indexOf(privacyMarker);

  if (view === "terms") {
    if (termsStart < 0) return content;
    return content.slice(termsStart, privacyStart > termsStart ? privacyStart : undefined).trim();
  }

  return privacyStart >= 0 ? content.slice(privacyStart).trim() : content;
}

function AuthClock() {
  const [time, setTime] = useState("9:41");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(`${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`);
    };
    update();
    const timer = window.setInterval(update, 15000);
    return () => window.clearInterval(timer);
  }, []);
  return <span>{time}</span>;
}

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
  const [localOtpFlow, setLocalOtpFlow] = useState(false);
  const [invitePreviewOnly, setInvitePreviewOnly] = useState(false);
  const [message, setMessage] = useState("正在恢复登录状态…");
  const [busy, setBusy] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [policy, setPolicy] = useState<CurrentPolicy | null>(null);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [policyView, setPolicyView] = useState<PolicyView | null>(null);
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
            setMessage("");
          } else if (body.data?.privacyOnly) {
            setStep("privacy");
            setMessage("删除申请正在处理，当前账号不能开始新的训练。");
          } else if (body.data?.needsConsent) {
            setStep("consent");
            setMessage("开始新训练前，请阅读并同意当前版本用户服务协议与隐私政策。");
          } else {
            setStep("authenticated");
            setMessage("");
          }
        } else {
          setStep("credentials");
          setMessage("");
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
    if (!policyView) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPolicyView(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [policyView]);

  useEffect(() => {
    if (
      step !== "credentials" &&
      step !== "otp" &&
      step !== "consent" &&
      step !== "privacy" &&
      !showPrivacy
    ) return;
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
        if (!cancelled) setMessage("用户服务协议与隐私政策加载失败，请稍后重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [showPrivacy, step]);

  async function requestOtp(event?: FormEvent) {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (busy) return;
    if (resendAfter > 0) {
      setMessage(`请等待 ${resendAfter} 秒后再重新发送验证码。`);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage("请先输入有效的邮箱地址。");
      return;
    }
    setBusy(true);
    setMessage("正在发送验证码…");
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail })
      });
      if (!response.ok) {
        setMessage(await readFailure(response));
        return;
      }
      const body = (await response.json()) as {
        data: {
          challengeId: string;
          resendAfterSec: number;
          deliveryMode?: "email" | "local";
          localOtpCode?: string;
        };
      };
      setChallengeId(body.data.challengeId);
      setResendAfter(body.data.resendAfterSec);
      setLocalOtpFlow(body.data.deliveryMode === "local");
      setInvitePreviewOnly(false);
      setToken("");
      setStep("otp");
      setMessage("");
    } catch {
      setMessage("网络请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    if (step !== "otp" || !challengeId) {
      setMessage("请先点击“发送验证码”，再输入收到的 6 位验证码。");
      return;
    }
    if (token.length !== 6) {
      setMessage("请输入完整的 6 位验证码。本地验收请使用页面提示的通用验证码。");
      return;
    }
    if (!policy || !policyChecked) {
      setMessage("请先阅读并同意《用户服务协议》和《隐私政策》。");
      return;
    }
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
        setInvitePreviewOnly(false);
        setStep("invite");
        setMessage("");
      } else if (body.data.privacyOnly) {
        setStep("privacy");
        setMessage("删除申请正在处理，当前账号不能开始新的训练。");
      } else if (body.data.needsConsent) {
        if (await persistConsent()) {
          setInvitePreviewOnly(localOtpFlow);
          setStep(localOtpFlow ? "invite" : "authenticated");
          setMessage("");
        }
      } else if (localOtpFlow) {
        setInvitePreviewOnly(true);
        setStep("invite");
        setMessage("");
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
    if (invitePreviewOnly) {
      if (!inviteCode.trim()) {
        setMessage("请输入邀请码。");
        return;
      }
      setStep("authenticated");
      setMessage("");
      return;
    }
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
        if (await persistConsent()) {
          setStep("authenticated");
          setMessage("");
        }
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

  async function persistConsent() {
    if (!policy || !policyChecked) return false;
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
        return false;
      }
      return true;
    } catch {
      setMessage("网络请求失败，请稍后重试。");
      return false;
    }
  }

  async function acceptConsent(event: FormEvent) {
    event.preventDefault();
    if (!policy || !policyChecked) return;
    setBusy(true);
    if (await persistConsent()) {
      setStep("authenticated");
      setMessage("");
    }
    setBusy(false);
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
    setLocalOtpFlow(false);
    setInvitePreviewOnly(false);
    setStep("credentials");
    setMessage("已退出登录。");
    setBusy(false);
  }

  if (step === "authenticated") {
    return (
      <>
        {enabled && visualTheme !== "juju" && (
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
                <h2>{policy?.title || "正在加载用户服务协议与隐私政策…"}</h2>
              </div>
              <button onClick={() => setShowPrivacy(false)} type="button">
                关闭
              </button>
            </div>
            {policy && (
              <>
                <div className="privacy-copy">
                  {renderPolicyContent(policy.content)}
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
      <section className={`auth-card auth-card-${step}`} aria-busy={busy}>
        {visualTheme === "juju" && (
          <>
            <div className="figma-statusbar juju-auth-statusbar">
              <AuthClock />
              <span>Facewall</span>
            </div>
            <JujuOrb className="juju-auth-orb" />
          </>
        )}
        <p className="auth-eyebrow">PASSBUDDY INTERNAL BETA</p>
        <h1>
          {step === "checking" || step === "credentials" || step === "otp" || step === "invite"
            ? "Hey ！"
            : step === "consent"
                ? policy?.title || "阅读用户服务协议与隐私政策"
                : step === "privacy"
                  ? "删除申请处理中"
              : "欢迎登录 PassBuddy"}
        </h1>
        <p className="auth-lead">
          {step === "checking" || step === "credentials" || step === "otp" || step === "invite"
            ? "面试助力，就找面壁者。"
            : step === "consent"
                ? "同意当前版本后才能开始新的面试训练；你仍可退出或提交数据删除申请。"
                : step === "privacy"
                  ? "你仍可查看用户服务协议、隐私政策和申请状态，或退出登录。"
              : "使用邮箱验证码注册或登录，无需设置密码。"}
        </p>

        {step === "checking" ? null : step === "credentials" || step === "otp" ? (
          <form
            className="auth-form juju-auth-login-form"
            onSubmit={verifyOtp}
          >
            <label>
              邮箱
              <img
                alt=""
                className="juju-auth-field-icon"
                height={16}
                src={emailIcon.src}
                width={16}
              />
              <input
                autoComplete="email"
                disabled={step === "otp" || busy}
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱"
                required
                type="email"
                value={email}
              />
            </label>
            <div className="juju-auth-code-row">
              <label>
                验证码
                <img
                  alt=""
                  className="juju-auth-field-icon"
                  height={16}
                  src={verificationCodeIcon.src}
                  width={16}
                />
                <input
                  autoComplete="one-time-code"
                  disabled={step !== "otp" || busy}
                  inputMode="numeric"
                  maxLength={6}
                  minLength={6}
                  onChange={(event) =>
                    setToken(event.target.value.replace(/\D/g, ""))
                  }
                  pattern="[0-9]{6}"
                  placeholder="请输入验证码"
                  required={step === "otp"}
                  value={token}
                />
              </label>
              <button
                className="juju-auth-send-code"
                disabled={busy}
                onClick={() => void requestOtp()}
                type="button"
              >
                {busy
                  ? "发送中…"
                  : step === "otp" && resendAfter > 0
                    ? `${resendAfter}秒后重发`
                    : "发送验证码"}
              </button>
            </div>
            <button
              className="auth-primary"
              disabled={busy}
              type="submit"
            >
              {busy ? "登录中…" : "登录"}
            </button>
            <div className="juju-auth-policy">
              <div className="juju-auth-consent-row">
                <input
                  aria-label="同意用户协议与隐私政策"
                  checked={policyChecked}
                  disabled={!policy || busy}
                  id="juju-auth-policy-consent"
                  onChange={(event) => setPolicyChecked(event.target.checked)}
                  type="checkbox"
                />
                <label htmlFor="juju-auth-policy-consent">已阅读并同意</label>
                <button onClick={() => setPolicyView("terms")} type="button">
                  《用户协议》
                </button>
                <span>与</span>
                <button onClick={() => setPolicyView("privacy")} type="button">
                  《隐私政策》
                </button>
              </div>
            </div>
          </form>
        ) : step === "invite" ? (
          <form className="auth-form juju-auth-invite-form" onSubmit={redeemInvite}>
            <label>
              内测邀请码
              <img
                alt=""
                className="juju-auth-invite-icon"
                height={16}
                src={invitationCodeIcon.src}
                width={16}
              />
              <input
                autoComplete="off"
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="请输入邀请码"
                required
                value={inviteCode}
              />
            </label>
            <button className="auth-primary" disabled={busy} type="submit">
              {busy ? "确认中…" : "确 定"}
            </button>
          </form>
        ) : step === "consent" ? (
          <form className="auth-form" onSubmit={acceptConsent}>
            <div className="privacy-copy">
              {policy ? (
                renderPolicyContent(policy.content)
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
                  我已阅读并同意当前版本《用户服务协议》和《隐私政策》
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
                renderPolicyContent(policy.content)
              ) : (
                <p>正在加载用户服务协议、隐私政策和删除申请状态…</p>
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
        {policyView && (
          <div className="juju-auth-webview-overlay" role="presentation">
            <section
              aria-label={policyView === "terms" ? "用户协议" : "隐私政策"}
              aria-modal="true"
              className="juju-auth-webview"
              role="dialog"
            >
              <header>
                <h2>{policyView === "terms" ? "用户协议" : "隐私政策"}</h2>
                <button
                  aria-label="关闭协议页面"
                  onClick={() => setPolicyView(null)}
                  type="button"
                >
                  关闭
                </button>
              </header>
              <div className="juju-auth-webview-content">
                {policy ? (
                  renderPolicyContent(getPolicyViewContent(policy.content, policyView))
                ) : (
                  <p>正在加载…</p>
                )}
              </div>
            </section>
          </div>
        )}
        {step !== "checking" && message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}
        {(step === "credentials" || step === "otp") && (
          <p className="auth-footnote">
            内测期间验证码暂设 30 分钟有效；重发后旧验证码立即失效，最多尝试 3 次。
          </p>
        )}
        {visualTheme === "juju" && (
          <div className="figma-home-indicator juju-auth-home-indicator" aria-hidden="true" />
        )}
      </section>
    </main>
  );
}

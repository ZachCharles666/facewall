"use client";

import type Aegis from "aegis-web-sdk";

import {
  isTencentRumEnabled,
  sanitizeRumUrl,
  sanitizeTencentRumClientError,
  sanitizeTencentRumEnvelope,
  type TencentRumClientError,
  type TencentRumEnvelope
} from "@/lib/observability/tencentRumPolicy";

type TencentRumInstance = Pick<Aegis, "destroy" | "report">;

let instancePromise: Promise<TencentRumInstance | null> | null = null;
const RUM_ERROR_LEVEL = 4;

function currentPath() {
  return typeof window === "undefined"
    ? "/"
    : sanitizeRumUrl(window.location.href);
}

function normalizedReleaseVersion() {
  const release = process.env.NEXT_PUBLIC_RELEASE_VERSION ?? "unversioned";
  return /^[0-9A-Za-z.,:_-]{1,60}$/.test(release)
    ? release
    : "unversioned";
}

export function initializeTencentRum() {
  const enabled = process.env.NEXT_PUBLIC_TENCENT_RUM_ENABLED;
  const projectId = process.env.NEXT_PUBLIC_TENCENT_RUM_ID;
  if (!isTencentRumEnabled(enabled, projectId)) {
    return Promise.resolve(null);
  }
  if (instancePromise) return instancePromise;

  instancePromise = import("aegis-web-sdk")
    .then(({ default: AegisWeb }) => {
      const instance = new AegisWeb({
        id: projectId,
        url: "https://rumt-zh.com/collect",
        pvUrl: "https://rumt-zh.com/collect/pv",
        whiteListUrl: "",
        eventUrl: "",
        speedUrl: "https://rumt-zh.com/speed",
        customTimeUrl: "",
        performanceUrl: "https://rumt-zh.com/speed/performance",
        webVitalsUrl: "https://rumt-zh.com/speed/webvitals",
        rateLimitUrl: "https://rumt-zh.com/collect/rateConfig",
        offlineUrl: "",
        env: "pre",
        version: normalizedReleaseVersion(),
        uin: "anonymous",
        aid: false,
        device: false,
        onError: false,
        consoleLog: false,
        clickElementLog: false,
        websocketHack: false,
        reportBridgeSpeed: false,
        reportAssetSpeed: false,
        blankScreen: false,
        lagMonitor: false,
        memoryMonitor: false,
        spa: true,
        pageUrl: currentPath(),
        urlHandler: currentPath,
        pagePerformance: {
          firstScreenInfo: false,
          urlHandler: currentPath
        },
        webVitals: true,
        reportApiSpeed: {
          urlHandler(url: string) {
            return sanitizeRumUrl(url);
          }
        },
        api: {
          apiDetail: false,
          reportRequest: false,
          reqHeaders: [],
          resHeaders: ["x-request-id"],
          retCodeHandler() {
            return { isErr: false, code: "unknown" };
          }
        },
        beforeRequest(value: TencentRumEnvelope) {
          return sanitizeTencentRumEnvelope(value);
        }
      });
      return instance;
    })
    .catch(() => null);

  return instancePromise;
}

export function captureTencentRumClientError(error: TencentRumClientError) {
  const sanitized = sanitizeTencentRumClientError(error);
  void initializeTencentRum().then((instance) => {
    instance?.report({
      msg: sanitized.name,
      level: RUM_ERROR_LEVEL,
      trace: sanitized.stack,
      ext1: sanitized.source,
      ext2: sanitized.path
    });
  });
}

export function resetTencentRumForTests() {
  void instancePromise?.then((instance) => instance?.destroy());
  instancePromise = null;
}

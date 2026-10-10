type ModelEnvironment = Record<string, string | undefined>;

export function modelConfig(env: ModelEnvironment) {
  if (env.DEEPSEEK_API_KEY?.trim()) {
    return {
      provider: "DeepSeek",
      model: env.DEEPSEEK_MODEL?.trim() || "deepseek-flash",
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: env.DEEPSEEK_API_KEY.trim(),
    };
  }
  if (env.OPENAI_API_KEY?.trim()) {
    return {
      provider: "OpenAI",
      model: env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: env.OPENAI_API_KEY.trim(),
    };
  }
  return null;
}

// Only these fields may cross the server boundary. Never serialize config itself.
export function modelStatus(env: ModelEnvironment) {
  const config = modelConfig(env);
  return {
    mode: config ? "model" : "demo",
    provider: config?.provider ?? null,
    model: config?.model ?? null,
  };
}

export class ModelServiceError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function modelAnswer(
  config: NonNullable<ReturnType<typeof modelConfig>>,
  messages: { role: "system" | "user"; content: string }[],
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: 1800,
        stream: false,
        ...(config.provider === "DeepSeek" ? { thinking: { type: "disabled" } } : {}),
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new ModelServiceError(
      timedOut ? "模型响应超时，请稍后重试。" : "暂时无法连接模型服务，请检查网络后重试。",
      timedOut ? 504 : 502,
    );
  }
  if (!response.ok) {
    const errors: Record<number, string> = {
      400: "模型请求未被接受，请检查服务端的模型配置。",
      401: "模型密钥验证失败，请更新服务端密钥。",
      402: "模型账户余额不足，请在模型服务平台充值后重试。",
      403: "模型账户暂无调用权限，请检查模型服务平台的账户设置。",
      404: "当前模型不可用，请检查服务端的模型名称。",
      429: "模型请求过于频繁，请稍后重试。",
    };
    // Do not return provider response bodies: they can contain sensitive context.
    throw new ModelServiceError(errors[response.status] || "模型服务暂不可用，请稍后重试。", response.status === 429 ? 429 : 502);
  }
  const data = await response.json().catch(() => null) as { choices?: { message?: { content?: string } }[] } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ModelServiceError("模型未返回有效内容，请重试。");
  }
  return content;
}

import { NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/files/textExtraction";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

interface ParsedUploadResponse {
  text: string;
  fileName: string;
  fileType: string;
  charCount: number;
  warnings: string[];
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(errorResponse<ParsedUploadResponse>("INPUT_INVALID", "上传请求不是合法表单。", false), {
      status: 400
    });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(errorResponse<ParsedUploadResponse>("INPUT_INVALID", "请上传一个文件。", false), {
      status: 400
    });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = extractTextFromFile(buffer, file.name, file.type);
    return NextResponse.json(
      okResponse<ParsedUploadResponse>({
        text: parsed.text,
        fileName: parsed.fileName,
        fileType: parsed.fileType,
        charCount: parsed.text.length,
        warnings: parsed.warnings
      })
    );
  } catch (error) {
    return NextResponse.json(
      errorResponse<ParsedUploadResponse>(
        "FILE_PARSE_FAILED",
        error instanceof Error ? error.message : "文件解析失败，请尝试复制文本后粘贴。",
        false
      ),
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";

import {
  FileTextExtractionError,
  extractTextFromFile,
  validateFileSize
} from "@/lib/files/textExtraction";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";

interface ParsedUploadResponse {
  text: string;
  fileName: string;
  fileType: string;
  charCount: number;
  warnings: string[];
}

export async function handleFileParsePost(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      errorResponse<ParsedUploadResponse>(
        "INPUT_INVALID",
        "上传请求不是合法表单。",
        false
      ),
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      errorResponse<ParsedUploadResponse>("INPUT_INVALID", "请上传一个文件。", false),
      { status: 400 }
    );
  }

  try {
    validateFileSize(file.size);
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await extractTextFromFile(buffer, file.name, file.type);
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
    const isUnrecognizablePdf =
      error instanceof FileTextExtractionError &&
      error.code === "PDF_TEXT_UNRECOGNIZABLE";
    return NextResponse.json(
      errorResponse<ParsedUploadResponse>(
        isUnrecognizablePdf ? error.code : "FILE_PARSE_FAILED",
        error instanceof Error
          ? error.message
          : "文件解析失败，请尝试复制文本后粘贴。",
        false
      ),
      { status: isUnrecognizablePdf ? 422 : 400 }
    );
  }
}

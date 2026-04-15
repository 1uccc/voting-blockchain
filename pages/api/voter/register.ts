import type { NextApiRequest, NextApiResponse } from "next";

type ErrorResponse = { message: string };

type ApiResponse = ErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  try {
    // Legacy endpoint intentionally disabled:
    // voters must register/login via Google OAuth flow.
    return res.status(410).json({
      message:
        "Đăng ký voter bằng email/password đã bị tắt. Vui lòng dùng Đăng nhập bằng Google.",
    });
  } catch (e) {
    console.error("Register API error:", e);
    return res.status(500).json({ message: "Internal server error." });
  }
}


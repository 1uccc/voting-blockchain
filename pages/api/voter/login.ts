import type { NextApiRequest, NextApiResponse } from "next";

type ErrorResponse = {
  message: string;
};

type ApiResponse = ErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  try {
    // Legacy endpoint intentionally disabled:
    // voters must login via Google OAuth flow.
    return res.status(410).json({
      message:
        "Đăng nhập voter bằng email/password đã bị tắt. Vui lòng dùng Đăng nhập bằng Google.",
    });
  } catch (error) {
    console.error("Login API error:", error);

    /**
     * Step 8: Handle unexpected server errors.
     */
    return res.status(500).json({
      message: "Internal server error.",
    });
  }
}

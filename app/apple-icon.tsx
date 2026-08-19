import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5c95b",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, transform: "rotate(-5deg)" }}>
        <div style={{ width: 25, height: 66, borderRadius: 14, background: "#173d32" }} />
        <div style={{ width: 25, height: 94, borderRadius: 14, background: "#173d32" }} />
        <div style={{ width: 25, height: 44, borderRadius: 14, background: "#173d32" }} />
      </div>
    </div>,
    size,
  );
}

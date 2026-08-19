import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5c95b",
        borderRadius: 112,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, transform: "rotate(-5deg)" }}>
        <div style={{ width: 72, height: 190, borderRadius: 40, background: "#173d32" }} />
        <div style={{ width: 72, height: 270, borderRadius: 40, background: "#173d32" }} />
        <div style={{ width: 72, height: 125, borderRadius: 40, background: "#173d32" }} />
      </div>
    </div>,
    size,
  );
}

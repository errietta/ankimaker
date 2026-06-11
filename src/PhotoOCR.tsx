import { useState, useEffect, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";
import { ApiClient, PhotoMeaningAPIResponse } from "./api/meaning";
import { SentenceCard } from "./types/Cards";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PhotoOCRProps {
  translationLanguage: string;
  onCardAdded: (card: SentenceCard) => void;
}

function PhotoOCR({ translationLanguage, onCardAdded }: PhotoOCRProps) {
  const { getAccessTokenSilently } = useAuth0();
  const { t } = useTranslation();

  const [imgSrc, setImgSrc] = useState("");
  const [rects, setRects] = useState<Rect[]>([]);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PhotoMeaningAPIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const hasScreenCapture = !!(navigator.mediaDevices?.getDisplayMedia);

  const loadImage = (src: string) => {
    setImgSrc(src);
    setRects([]);
    setDrawing(null);
    setResult(null);
    setError(null);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => loadImage(reader.result?.toString() || ""));
    reader.readAsDataURL(e.target.files[0]);
  };

  const handleScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
      await video.play();
      // Wait for a frame to be ready before capturing
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      const offscreen = document.createElement("canvas");
      offscreen.width = video.videoWidth;
      offscreen.height = video.videoHeight;
      offscreen.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      loadImage(offscreen.toDataURL("image/png"));
    } catch {
      // User cancelled or permission denied — nothing to do
    }
  };

  const onImageLoad = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const scale = Math.min(1, 640 / img.naturalWidth);
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgSrc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    rects.forEach((r, i) => {
      ctx.fillStyle = "rgba(59, 130, 246, 0.25)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(`${i + 1}`, r.x + 4, r.y + 16);
    });

    if (drawing) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(drawing.x, drawing.y, drawing.w, drawing.h);
      ctx.setLineDash([]);
    }
  }, [rects, drawing, imgSrc]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const displayRect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    const cssX = src.clientX - displayRect.left;
    const cssY = src.clientY - displayRect.top;
    return {
      x: cssX * (canvas.width / displayRect.width),
      y: cssY * (canvas.height / displayRect.height),
    };
  };

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoords(e);
    dragStart.current = coords;
    setDrawing({ x: coords.x, y: coords.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!dragStart.current) return;
    const { x, y } = getCoords(e);
    setDrawing({
      x: Math.min(dragStart.current.x, x),
      y: Math.min(dragStart.current.y, y),
      w: Math.abs(x - dragStart.current.x),
      h: Math.abs(y - dragStart.current.y),
    });
  };

  const onPointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!dragStart.current || !drawing) return;
    if (drawing.w > 5 && drawing.h > 5) {
      setRects((prev) => [...prev, drawing]);
    }
    setDrawing(null);
    dragStart.current = null;
  };

  const handleSubmit = async () => {
    if (!imgRef.current || !canvasRef.current) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;

    let base64: string;

    if (rects.length === 0) {
      // No region selected — use whole image
      const out = document.createElement("canvas");
      out.width = img.naturalWidth;
      out.height = img.naturalHeight;
      out.getContext("2d")!.drawImage(img, 0, 0);
      base64 = out.toDataURL("image/jpeg").split(",")[1];
    } else {
      const scaleX = img.naturalWidth / canvas.width;
      const scaleY = img.naturalHeight / canvas.height;

      const scaled = rects.map((r) => ({
        x: r.x * scaleX,
        y: r.y * scaleY,
        w: r.w * scaleX,
        h: r.h * scaleY,
      }));

      const totalWidth = Math.max(...scaled.map((r) => r.w));
      const totalHeight = scaled.reduce((sum, r) => sum + r.h, 0);

      const out = document.createElement("canvas");
      out.width = totalWidth;
      out.height = totalHeight;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      let offsetY = 0;
      for (const r of scaled) {
        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, offsetY, r.w, r.h);
        offsetY += r.h;
      }

      base64 = out.toDataURL("image/jpeg").split(",")[1];
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const accessToken = await getAccessTokenSilently({
        authorizationParams: { audience: "https://card.backend/", scope: "read:current_user" },
      });
      const data = await new ApiClient(accessToken).getPhotoMeaning(base64, "image/jpeg", translationLanguage);
      setResult(data);
    } catch {
      setError(t("ocr_error"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCardList = () => {
    if (!result) return;
    onCardAdded({
      text: result.reply.sentence,
      meaning: result.reply.meaning,
      reading: result.reply.reading,
    });
  };

  return (
    <div className="photo-ocr-container">
      <div className="photo-ocr-source-row">
        <label className="photo-ocr-upload-btn">
          <input type="file" accept="image/*" onChange={onFileChange} style={{ display: "none" }} />
          {t("upload_image")}
        </label>
        {hasScreenCapture && (
          <button className="button-alt" onClick={handleScreenCapture}>
            {t("capture_screen")}
          </button>
        )}
      </div>

      {imgSrc && (
        <>
          <img ref={imgRef} src={imgSrc} alt="" style={{ display: "none" }} onLoad={onImageLoad} />
          <p className="photo-ocr-instruction">{t("drag_to_select")}</p>
          <canvas
            ref={canvasRef}
            className="photo-ocr-canvas"
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          />
          <div className="photo-ocr-actions">
            <button
              className="button-alt"
              onClick={() => setRects((prev) => prev.slice(0, -1))}
              disabled={rects.length === 0}
            >
              {t("remove_last")}
            </button>
            <button
              className="button-danger"
              onClick={() => {
                setRects([]);
                setResult(null);
                setError(null);
              }}
              disabled={rects.length === 0}
            >
              {t("clear_regions")}
            </button>
            <button onClick={handleSubmit} disabled={isLoading}>
              {t("crop_and_submit")}
            </button>
          </div>
        </>
      )}

      {isLoading && <p className="photo-ocr-loading">{t("ocr_loading")}</p>}
      {error && <p className="photo-ocr-error">{error}</p>}
      {result && (
        <div className="result photo-ocr-result">
          <p>
            <strong>{t("ocr_extracted_text")}:</strong> {result.prompt}
          </p>
          <p>
            <strong>{t("reading")}:</strong> {result.reply.reading}
          </p>
          <p>
            <strong>{t("meaning")}:</strong> {result.reply.meaning}
          </p>
          <button className="button-add" onClick={handleAddToCardList}>
            {t("add_to_card_list")}
          </button>
        </div>
      )}
    </div>
  );
}

export default PhotoOCR;

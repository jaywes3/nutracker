import React, { useEffect, useRef, useState } from 'react';
import { Barcode, Camera, Loader2, Plus, X } from 'lucide-react';
import { lookupBarcodeAcrossDatabases } from '../engine/foodSearch';
import type { FoodItem } from '../types';

/**
 * Lightweight pure-JS 1D EAN-13 / UPC-A scanline fallback for browsers
 * (like older iOS Safari) that lack native window.BarcodeDetector.
 */
const L_CODES: Record<string, number> = {
  '0001101': 0,
  '0011001': 1,
  '0010011': 2,
  '0111101': 3,
  '0100011': 4,
  '0110001': 5,
  '0101111': 6,
  '0111011': 7,
  '0110111': 8,
  '0001011': 9,
};
const G_CODES: Record<string, number> = {
  '0100111': 0,
  '0110011': 1,
  '0011011': 2,
  '0100001': 3,
  '0011101': 4,
  '0111001': 5,
  '0000101': 6,
  '0010001': 7,
  '0001001': 8,
  '0010111': 9,
};
const R_CODES: Record<string, number> = {
  '1110010': 0,
  '1100110': 1,
  '1101100': 2,
  '1000010': 3,
  '1011100': 4,
  '1001110': 5,
  '1010000': 6,
  '1000100': 7,
  '1001000': 8,
  '1110100': 9,
};
const PARITY_MAP: Record<string, number> = {
  LLLLLL: 0,
  LLGLGG: 1,
  LLGGLG: 2,
  LLGGGL: 3,
  LGLLGG: 4,
  LGGLLG: 5,
  LGGGLL: 6,
  LGLGLG: 7,
  LGLGGL: 8,
  LGGLGL: 9,
};

function tryDecodeEan13FromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);

  // Sample 5 horizontal scanlines across the center frame
  for (const frac of [0.5, 0.42, 0.58, 0.35, 0.65]) {
    const y = Math.floor(h * frac);
    const data = ctx.getImageData(0, y, w, 1).data;
    const lum = new Uint8Array(w);
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const v = (data[x * 4] * 77 + data[x * 4 + 1] * 150 + data[x * 4 + 2] * 29) >> 8;
      lum[x] = v;
      sum += v;
    }
    const thresh = (sum / w) * 0.92;
    // Build run-length bars (1 = dark, 0 = light)
    const runs: Array<{ bit: number; len: number; x: number }> = [];
    let cur = lum[0] < thresh ? 1 : 0;
    let len = 1;
    let startX = 0;
    for (let x = 1; x < w; x++) {
      const b = lum[x] < thresh ? 1 : 0;
      if (b === cur) {
        len++;
      } else {
        runs.push({ bit: cur, len, x: startX });
        cur = b;
        len = 1;
        startX = x;
      }
    }
    runs.push({ bit: cur, len, x: startX });

    // Look for 101 start guard followed by 59 total runs
    for (let i = 0; i + 59 <= runs.length; i++) {
      if (runs[i].bit !== 1 || runs[i + 1].bit !== 0 || runs[i + 2].bit !== 1) continue;
      const unit = (runs[i].len + runs[i + 1].len + runs[i + 2].len) / 3;
      if (unit < 0.8 || unit > 14) continue;
      if (
        Math.abs(runs[i].len - unit) > unit * 0.75 ||
        Math.abs(runs[i + 1].len - unit) > unit * 0.75 ||
        Math.abs(runs[i + 2].len - unit) > unit * 0.75
      ) {
        continue;
      }

      const endX = runs[i + 58].x + runs[i + 58].len;
      const totalWidth = endX - runs[i].x;
      const modW = totalWidth / 95;
      if (Math.abs(modW - unit) > unit * 0.45) continue;

      let bits = '';
      for (let m = 0; m < 95; m++) {
        const sampleX = Math.min(w - 1, Math.floor(runs[i].x + (m + 0.5) * modW));
        bits += lum[sampleX] < thresh ? '1' : '0';
      }
      if (!bits.startsWith('101') || bits.slice(45, 50) !== '01010' || !bits.endsWith('101')) {
        continue;
      }

      let parity = '';
      const digits: number[] = [];
      let valid = true;
      for (let d = 0; d < 6; d++) {
        const seg = bits.slice(3 + d * 7, 3 + (d + 1) * 7);
        if (seg in L_CODES) {
          parity += 'L';
          digits.push(L_CODES[seg]);
        } else if (seg in G_CODES) {
          parity += 'G';
          digits.push(G_CODES[seg]);
        } else {
          valid = false;
          break;
        }
      }
      if (!valid || !(parity in PARITY_MAP)) continue;
      const firstDigit = PARITY_MAP[parity];

      for (let d = 0; d < 6; d++) {
        const seg = bits.slice(50 + d * 7, 50 + (d + 1) * 7);
        if (seg in R_CODES) {
          digits.push(R_CODES[seg]);
        } else {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      const full = [firstDigit, ...digits];
      // Verify EAN-13 checksum!
      let chk = 0;
      for (let k = 0; k < 12; k++) {
        chk += full[k] * (k % 2 === 0 ? 1 : 3);
      }
      const expectedCheck = (10 - (chk % 10)) % 10;
      if (expectedCheck === full[12]) {
        return full.join('');
      }
    }
  }
  return null;
}

interface InlineBarcodeScannerProps {
  catalog: FoodItem[];
  usdaApiKey?: string;
  offlineOnlyMode: boolean;
  autoStartCamera?: boolean;
  compact?: boolean;
  onFoodFound: (food: FoodItem) => void;
  onBarcodeCaptured?: (code: string) => void;
  onAttachUnknownBarcode?: (code: string) => void;
  onRecordNetworkAudit?: (dest: string, purpose: string, allowed: boolean) => void;
  onCloseScanner?: () => void;
}

export const InlineBarcodeScanner: React.FC<InlineBarcodeScannerProps> = ({
  catalog,
  usdaApiKey,
  offlineOnlyMode,
  autoStartCamera = false,
  compact = false,
  onFoodFound,
  onBarcodeCaptured,
  onAttachUnknownBarcode,
  onRecordNetworkAudit,
  onCloseScanner,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(true);
  const cameraGenerationRef = useRef(0);

  const stopCamera = () => {
    cameraGenerationRef.current++;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    activeRef.current = true;
    if (autoStartCamera) {
      startCameraScan();
    }
    return () => {
      activeRef.current = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLookup = async (rawCode: string) => {
    const clean = rawCode.replace(/[^0-9]/g, '');
    if (!clean) return;
    if (onBarcodeCaptured) { stopCamera(); onBarcodeCaptured(clean); return; }
    setBarcodeInput(clean);
    setNotFoundCode(null);
    setLoading(true);
    setStatus('Looking up barcode across Local DB, Open Food Facts (3.5M+) & USDA...');

    const res = await lookupBarcodeAcrossDatabases({
      rawCode: clean,
      catalog,
      usdaApiKey,
      offlineOnlyMode,
      onAudit: onRecordNetworkAudit,
    });

    setLoading(false);
    setStatus(res.sourceLabel);

    if (res.item) {
      onFoodFound(res.item);
    } else if (res.notFoundCode) {
      setNotFoundCode(res.notFoundCode);
    }
  };

  const startCameraScan = async () => {
    stopCamera();
    const generation = cameraGenerationRef.current;
    setStatus(null);
    setNotFoundCode(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!activeRef.current || generation !== cameraGenerationRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 80);

      const BarcodeDetectorCls = (window as any).BarcodeDetector;
      let detector: any = null;
      try {
        if (BarcodeDetectorCls) detector = new BarcodeDetectorCls({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      } catch {
        // Some devices reject a format list; use the EAN-13/UPC-A fallback.
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }

      const interval = setInterval(async () => {
        if (!videoRef.current || !streamRef.current) {
          clearInterval(interval);
          return;
        }
        try {
          if (detector) {
            const codes = await detector.detect(videoRef.current);
            if (generation !== cameraGenerationRef.current || !streamRef.current) return;
            if (codes && codes.length > 0 && codes[0].rawValue) {
              clearInterval(interval);
              stopCamera();
              handleLookup(codes[0].rawValue);
              return;
            }
          } else if (canvasRef.current) {
            const fallbackCode = tryDecodeEan13FromVideo(
              videoRef.current,
              canvasRef.current
            );
            if (fallbackCode) {
              clearInterval(interval);
              stopCamera();
              handleLookup(fallbackCode);
              return;
            }
          }
        } catch {
          // frame not ready
        }
      }, 320);
      intervalRef.current = interval;
    } catch {
      if (activeRef.current && generation === cameraGenerationRef.current) {
        stopCamera();
        setStatus('Camera access unavailable — type the barcode numbers on the package below.');
      }
    }
  };

  return (
    <div
      className={`rounded-xl border ${
        compact
          ? 'bg-slate-900/95 border-amber-500/35 p-3 space-y-2.5'
          : 'bg-slate-950/60 border-slate-800 p-3.5 space-y-3'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
          <Barcode className="w-4 h-4" />
          {onBarcodeCaptured ? 'Scan Custom Food Barcode' : compact ? 'Scan Ingredient Barcode' : 'UPC / EAN Barcode Scanner'}
        </span>
        <div className="flex items-center gap-2">
          {!cameraActive ? (
            <button
              type="button"
              onClick={startCameraScan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Open Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer"
            >
              Stop Camera
            </button>
          )}
          {onCloseScanner && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onCloseScanner();
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Close scanner"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {cameraActive && (
        <div className="relative rounded-xl overflow-hidden border border-amber-500/40 bg-black aspect-video max-h-52 mx-auto">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-52 h-24 border-2 border-amber-400/85 rounded-xl shadow-[0_0_24px_rgba(251,191,36,0.3)]" />
          </div>
          <div className="absolute bottom-1.5 inset-x-0 text-center text-[10px] text-amber-200 bg-black/50 py-0.5">
            Center the package barcode inside the box
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Or type UPC / EAN barcode digits..."
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookup(barcodeInput); } }}
          className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums focus:outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={() => handleLookup(barcodeInput)}
          disabled={loading || !barcodeInput.trim()}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-100 shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {onBarcodeCaptured ? 'Use Barcode' : 'Lookup'}
        </button>
      </div>

      {status && (
        <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-2.5 text-xs text-slate-300 space-y-2">
          <div>{status}</div>
          {notFoundCode && onAttachUnknownBarcode && (
            <button
              type="button"
              onClick={() => onAttachUnknownBarcode(notFoundCode)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Enter Nutrition Label & Save Barcode ({notFoundCode})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

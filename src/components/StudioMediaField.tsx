import React, { useId, useRef, useState } from 'react';
import { Camera, Film, ImagePlus, Trash2, Upload } from 'lucide-react';
import { STUDIO_IMAGE_PRESETS } from './StudioImageField';
import type { MediaAssetType } from '../types/studio';

interface StudioMediaFieldProps {
  label: string;
  value: string;
  mediaType: MediaAssetType;
  onChange: (nextUrl: string) => void;
  onChangeMediaType?: (nextType: MediaAssetType) => void;
  onUploadMedia?: (
    file: File,
    targetModelId?: string,
    allowVideo?: boolean
  ) => Promise<{
    ok: boolean;
    url?: string;
    mediaType?: MediaAssetType;
    error?: string;
  }>;
  targetModelId?: string;
  allowVideo?: boolean;
  placeholder?: string;
  required?: boolean;
  showPresets?: boolean;
}

export function inferMediaTypeFromUrl(url: string): MediaAssetType | null {
  const lower = url.trim().toLowerCase();
  if (!lower) return null;
  if (
    /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(lower) ||
    lower.includes('youtube.com/') ||
    lower.includes('youtu.be/') ||
    lower.includes('vimeo.com/')
  ) {
    return 'video';
  }
  if (/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(lower)) {
    return 'photo';
  }
  return null;
}

export const StudioMediaField: React.FC<StudioMediaFieldProps> = ({
  label,
  value,
  mediaType,
  onChange,
  onChangeMediaType,
  onUploadMedia,
  targetModelId,
  allowVideo = true,
  placeholder = 'https://... ou envie arquivo de foto/vídeo do dispositivo',
  required = false,
  showPresets = false,
}) => {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const acceptTypes = allowVideo
    ? 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime'
    : 'image/png,image/jpeg,image/webp,image/gif';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadMedia) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await onUploadMedia(file, targetModelId, allowVideo);
      if (res.ok && res.url) {
        setPreviewFailed(false);
        onChange(res.url);
        if (onChangeMediaType && res.mediaType) {
          onChangeMediaType(res.mediaType);
        }
      } else {
        setUploadError(res.error || 'Falha ao enviar arquivo.');
      }
    } finally {
      setUploading(false);
    }
  };

  const isExternalEmbed =
    mediaType === 'video' &&
    Boolean(value) &&
    (value.includes('youtube.com/') ||
      value.includes('youtu.be/') ||
      value.includes('vimeo.com/'));

  return (
    <div className="space-y-2.5 p-3.5 rounded-xl bg-[#0B060F]/85 border border-[#F4C2D7]/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-[#FAF4F7]">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {onUploadMedia && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={acceptTypes}
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#21142D] border border-[#F4C2D7]/35 text-[#F4C2D7] hover:text-[#FAF4F7] hover:border-[#F4C2D7] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>
                  {uploading
                    ? 'Enviando...'
                    : allowVideo
                      ? 'Enviar Foto ou Vídeo'
                      : 'Enviar Foto'}
                </span>
              </button>
            </>
          )}
          {showPresets && mediaType !== 'video' && (
            <button
              type="button"
              onClick={() => setPresetsOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#150D1D] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors cursor-pointer"
            >
              <ImagePlus className="w-3 h-3 text-[#F4C2D7]" />
              <span>{presetsOpen ? 'Ocultar Sugestões' : 'Galeria Studio'}</span>
            </button>
          )}
          {value && (
            <button
              type="button"
              onClick={() => {
                setPreviewFailed(false);
                onChange('');
              }}
              aria-label={`Limpar ${label}`}
              className="p-1 rounded-lg bg-[#150D1D] border border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="shrink-0 w-24 h-16 rounded-xl overflow-hidden bg-[#150D1D] border border-[#F4C2D7]/25 flex items-center justify-center">
          {value && !previewFailed ? (
            mediaType === 'video' ? (
              isExternalEmbed ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[10px] text-[#F4C2D7]">
                  <Film className="w-4 h-4" />
                  <span>Vídeo Link</span>
                </div>
              ) : (
                <video
                  src={value}
                  muted
                  playsInline
                  preload="metadata"
                  onError={() => setPreviewFailed(true)}
                  className="w-full h-full object-cover"
                />
              )
            ) : (
              <img
                src={value}
                alt={label}
                referrerPolicy="no-referrer"
                onError={() => setPreviewFailed(true)}
                className="w-full h-full object-cover"
              />
            )
          ) : mediaType === 'video' ? (
            <Film className="w-5 h-5 text-[#F4C2D7]/55" />
          ) : (
            <Camera className="w-5 h-5 text-[#F4C2D7]/55" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <input
            id={inputId}
            type="text"
            maxLength={500}
            required={required}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              setPreviewFailed(false);
              onChange(next);
              if (onChangeMediaType) {
                const detected = inferMediaTypeFromUrl(next);
                if (detected && (allowVideo || detected === 'photo')) {
                  onChangeMediaType(detected);
                }
              }
            }}
            placeholder={placeholder}
            className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
          />
          <p className="text-[11px] text-[#938291]">
            {allowVideo
              ? 'Fotos (PNG/JPG/WEBP/GIF até 5 MB), Vídeos (MP4/MOV/WEBM até 40 MB) ou cole o link externo.'
              : 'Fotos PNG/JPG/WEBP/GIF até 5 MB ou link HTTPS.'}
          </p>
        </div>
      </div>

      {uploadError && (
        <p role="alert" className="text-[11px] text-red-300">
          {uploadError}
        </p>
      )}

      {presetsOpen && (
        <div className="pt-2 border-t border-[#F4C2D7]/15 space-y-2">
          <p className="text-[11px] text-[#C9BAC4]">
            Clique em uma foto do estúdio para aplicar:
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STUDIO_IMAGE_PRESETS.map((preset) => {
              const isSelected = value === preset.src;
              return (
                <button
                  key={`${preset.label}-${preset.src}`}
                  type="button"
                  onClick={() => {
                    setPreviewFailed(false);
                    onChange(preset.src);
                    onChangeMediaType?.('photo');
                    setPresetsOpen(false);
                  }}
                  title={preset.label}
                  className={`group rounded-lg overflow-hidden border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#F4C2D7] ring-1 ring-[#F4C2D7]'
                      : 'border-[#F4C2D7]/20 hover:border-[#F4C2D7]/55'
                  }`}
                >
                  <div className="aspect-square w-full bg-[#150D1D] overflow-hidden">
                    <img
                      src={preset.src}
                      alt={preset.label}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <p className="px-1.5 py-1 text-[10px] text-[#FAF4F7] truncate bg-[#150D1D]">
                    {preset.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

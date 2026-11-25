import React, { useId, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, Upload } from 'lucide-react';
import { DEFAULT_GALLERY_ITEMS, DEFAULT_STUDIO_CONFIG } from '../lib/studioDefaults';

export interface StudioImagePreset {
  label: string;
  src: string;
}

export const STUDIO_IMAGE_PRESETS: ReadonlyArray<StudioImagePreset> = [
  { label: 'Avatar Clássico', src: DEFAULT_STUDIO_CONFIG.modelAvatarUrl },
  { label: 'Capa Principal', src: DEFAULT_STUDIO_CONFIG.heroImageUrl },
  { label: 'Salão Privado', src: DEFAULT_STUDIO_CONFIG.loungeImageUrl },
  ...DEFAULT_GALLERY_ITEMS.slice(0, 4).map((g) => ({
    label: g.title,
    src: g.src,
  })),
];

interface StudioImageFieldProps {
  label: string;
  value: string;
  onChange: (nextUrl: string) => void;
  onUploadImage?: (
    file: File,
    targetModelId?: string
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  targetModelId?: string;
  previewShape?: 'avatar' | 'landscape';
  placeholder?: string;
  required?: boolean;
  showPresets?: boolean;
}

export const StudioImageField: React.FC<StudioImageFieldProps> = ({
  label,
  value,
  onChange,
  onUploadImage,
  targetModelId,
  previewShape = 'landscape',
  placeholder = 'https://... ou envie do dispositivo',
  required = false,
  showPresets = true,
}) => {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadImage) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await onUploadImage(file, targetModelId);
      if (res.ok && res.url) {
        setImgFailed(false);
        onChange(res.url);
      } else {
        setUploadError(res.error || 'Falha ao enviar imagem.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 p-3.5 rounded-xl bg-[#0B060F]/85 border border-[#F4C2D7]/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-[#FAF4F7]"
        >
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {onUploadImage && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
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
                <span>{uploading ? 'Enviando...' : 'Enviar Foto'}</span>
              </button>
            </>
          )}
          {showPresets && (
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
                setImgFailed(false);
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
        <div
          className={`shrink-0 overflow-hidden bg-[#150D1D] border border-[#F4C2D7]/25 flex items-center justify-center ${
            previewShape === 'avatar'
              ? 'w-14 h-14 rounded-full'
              : 'w-20 h-14 rounded-xl'
          }`}
        >
          {value && !imgFailed ? (
            <img
              src={value}
              alt={label}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <Camera className="w-5 h-5 text-[#F4C2D7]/55" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <input
            id={inputId}
            type="text"
            maxLength={500}
            required={required}
            value={value}
            onChange={(e) => {
              setImgFailed(false);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
          />
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
            Clique em uma foto do estúdio para aplicar instantaneamente:
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STUDIO_IMAGE_PRESETS.map((preset) => {
              const isSelected = value === preset.src;
              return (
                <button
                  key={`${preset.label}-${preset.src}`}
                  type="button"
                  onClick={() => {
                    setImgFailed(false);
                    onChange(preset.src);
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

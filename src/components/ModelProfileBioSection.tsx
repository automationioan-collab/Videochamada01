import React from 'react';
import type { ModelBasicInfo } from '../types/studio';

interface ModelProfileBioSectionProps {
  modelName: string;
  studioBrand: string;
  modelBio?: string;
  basicInfo?: ModelBasicInfo;
  avatarUrl?: string;
}

export const ModelProfileBioSection: React.FC<ModelProfileBioSectionProps> = ({
  modelName,
  studioBrand,
  modelBio,
  basicInfo,
  avatarUrl,
}) => {
  const details: Array<{ label: string; value: string }> = [];
  if (basicInfo?.age) details.push({ label: 'Idade', value: basicInfo.age });
  if (basicInfo?.location)
    details.push({ label: 'Localização', value: basicInfo.location });
  if (basicInfo?.languages)
    details.push({ label: 'Idiomas', value: basicInfo.languages });
  if (basicInfo?.height) details.push({ label: 'Altura', value: basicInfo.height });
  if (basicInfo?.appearance)
    details.push({ label: 'Visual / Estilo', value: basicInfo.appearance });
  if (basicInfo?.specialty)
    details.push({ label: 'Especialidade', value: basicInfo.specialty });
  if (basicInfo?.availabilityNote)
    details.push({ label: 'Horários', value: basicInfo.availabilityNote });

  const hasBio = Boolean(modelBio && modelBio.trim());
  if (!hasBio && details.length === 0) return null;

  return (
    <section
      aria-labelledby="perfil-modelo-heading"
      className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-5 border-b border-[#818CF8]/15">
        <div className="flex items-center gap-4 min-w-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={modelName}
              referrerPolicy="no-referrer"
              draggable={false}
              className="w-16 h-16 rounded-full object-cover border border-[#38BDF8]/50 shrink-0 bg-[#0B1026]"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#131C42] border border-[#818CF8]/40 flex items-center justify-center font-display text-2xl font-bold text-[#A5B4FC] shrink-0">
              {modelName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-[#38BDF8]">
              Sobre a Modelo · {studioBrand}
            </p>
            <h2
              id="perfil-modelo-heading"
              className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] truncate"
            >
              {modelName}
            </h2>
          </div>
        </div>
      </div>

      {hasBio && (
        <p className="text-sm sm:text-base text-[#E2E8F0] leading-relaxed max-w-4xl">
          {modelBio}
        </p>
      )}

      {details.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 pt-4 border-t border-[#818CF8]/15">
          {details.map((item) => (
            <div key={item.label} className="space-y-1">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-[#94A3B8]">
                {item.label}
              </dt>
              <dd className="text-sm font-medium text-[#F8FAFC]">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};

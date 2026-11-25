export type AdminThemeId =
  | 'rose_velvet'
  | 'sapphire_cobalt'
  | 'emerald_jade'
  | 'amber_gold'
  | 'violet_amethyst'
  | 'crimson_ruby'
  | 'cyan_teal'
  | 'coral_sunset';

export interface AdminModelThemePalette {
  id: AdminThemeId;
  label: string;
  swatchHex: string;
  accentText: string;
  accentSoft: string;
  accentStrong: string;
  ctaText: string;
  canvasBg: string;
  surfaceDeep: string;
  surfaceCard: string;
  surfaceActive: string;
}

export const DEFAULT_ADMIN_THEME_ID: AdminThemeId = 'rose_velvet';

export const ADMIN_MODEL_THEMES: ReadonlyArray<AdminModelThemePalette> = [
  {
    id: 'rose_velvet',
    label: 'Rosa Velvet',
    swatchHex: '#F4C2D7',
    accentText: '#F4C2D7',
    accentSoft: '#F8D6E3',
    accentStrong: '#E7A6C2',
    ctaText: '#190B15',
    canvasBg: '#0B060F',
    surfaceDeep: '#0B060F',
    surfaceCard: '#170D21',
    surfaceActive: '#241432',
  },
  {
    id: 'sapphire_cobalt',
    label: 'Azul Safira',
    swatchHex: '#60A5FA',
    accentText: '#93C5FD',
    accentSoft: '#DBEAFE',
    accentStrong: '#3B82F6',
    ctaText: '#061325',
    canvasBg: '#060B16',
    surfaceDeep: '#070E1C',
    surfaceCard: '#0D182E',
    surfaceActive: '#15284A',
  },
  {
    id: 'emerald_jade',
    label: 'Verde Esmeralda',
    swatchHex: '#34D399',
    accentText: '#6EE7B7',
    accentSoft: '#D1FAE5',
    accentStrong: '#10B981',
    ctaText: '#052016',
    canvasBg: '#05110D',
    surfaceDeep: '#061611',
    surfaceCard: '#0A2119',
    surfaceActive: '#103428',
  },
  {
    id: 'amber_gold',
    label: 'Âmbar Dourado',
    swatchHex: '#FBBF24',
    accentText: '#FDE68A',
    accentSoft: '#FEF3C7',
    accentStrong: '#F59E0B',
    ctaText: '#1F1303',
    canvasBg: '#120D05',
    surfaceDeep: '#171006',
    surfaceCard: '#22180A',
    surfaceActive: '#33230E',
  },
  {
    id: 'violet_amethyst',
    label: 'Violeta Ametista',
    swatchHex: '#A78BFA',
    accentText: '#C4B5FD',
    accentSoft: '#EDE9FE',
    accentStrong: '#8B5CF6',
    ctaText: '#130B29',
    canvasBg: '#0B0718',
    surfaceDeep: '#0F0A20',
    surfaceCard: '#181030',
    surfaceActive: '#241946',
  },
  {
    id: 'crimson_ruby',
    label: 'Rubi Carmim',
    swatchHex: '#FB7185',
    accentText: '#FDA4AF',
    accentSoft: '#FFE4E6',
    accentStrong: '#F43F5E',
    ctaText: '#250610',
    canvasBg: '#14060B',
    surfaceDeep: '#19080E',
    surfaceCard: '#240D15',
    surfaceActive: '#381320',
  },
  {
    id: 'cyan_teal',
    label: 'Azul Ciano',
    swatchHex: '#22D3EE',
    accentText: '#67E8F9',
    accentSoft: '#CFFAFE',
    accentStrong: '#06B6D4',
    ctaText: '#051E24',
    canvasBg: '#061116',
    surfaceDeep: '#07151B',
    surfaceCard: '#0B2028',
    surfaceActive: '#12323D',
  },
  {
    id: 'coral_sunset',
    label: 'Coral Sunset',
    swatchHex: '#FB923C',
    accentText: '#FDBA74',
    accentSoft: '#FFEDD5',
    accentStrong: '#F97316',
    ctaText: '#261004',
    canvasBg: '#140A06',
    surfaceDeep: '#1A0D08',
    surfaceCard: '#26130B',
    surfaceActive: '#391D10',
  },
];

export function isValidAdminThemeId(value: unknown): value is AdminThemeId {
  return (
    typeof value === 'string' &&
    ADMIN_MODEL_THEMES.some((theme) => theme.id === value)
  );
}

export function getAdminModelTheme(
  themeId?: string | null,
  fallbackIndex = 0
): AdminModelThemePalette {
  const matched = ADMIN_MODEL_THEMES.find((t) => t.id === themeId);
  if (matched) return matched;
  const idx = Math.abs(fallbackIndex) % ADMIN_MODEL_THEMES.length;
  return ADMIN_MODEL_THEMES[idx];
}

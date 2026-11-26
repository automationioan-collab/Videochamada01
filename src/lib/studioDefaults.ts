import type {
  GalleryCategoryType,
  MediaAssetType,
  ModelBasicInfo,
  PublicApprovalStatus,
} from '../types/studio';

export interface DefaultStudioConfigValues {
  studioBrand: string;
  modelName: string;
  modelAvatarUrl: string;
  heroImageUrl: string;
  loungeImageUrl: string;
  modelBio: string;
  basicInfo?: ModelBasicInfo;
  heroTitle: string;
  heroSubtitle: string;
  headline: string;
  groupButtonLabel: string;
  privateButtonLabel: string;
  ratePerMinuteCents: number;
  privateAlbumPriceCents?: number;
}

export const DEFAULT_STUDIO_CONFIG: DefaultStudioConfigValues = {
  studioBrand: 'Model Gat Brasil',
  modelName: 'Lorena Noir',
  modelAvatarUrl: '/src/assets/images/model_avatar_camila_1794946401641.jpg',
  heroImageUrl: '/src/assets/images/model_studio_hero_1794946401293.jpg',
  loungeImageUrl: '/src/assets/images/studio_backdrop_lounge_1794946401840.jpg',
  modelBio:
    'Atendimento exclusivo em sala privativa 1-para-1 mediante pagamento em vídeo HD, com apenas 1 internauta por sessão.',
  heroTitle: 'Sala privativa ao vivo com Lorena Noir.',
  heroSubtitle:
    'Atendimento 100% privativo (1-para-1) liberado mediante pagamento. Apenas 1 internauta por vez na sala com total exclusividade.',
  headline:
    'Sala privativa 1-para-1 exclusiva com Lorena Noir mediante pagamento.',
  groupButtonLabel: 'Entrar na Sala Privativa (1-para-1)',
  privateButtonLabel: 'Contratar Sala Privativa (1-para-1)',
  ratePerMinuteCents: 1500,
  privateAlbumPriceCents: 3900,
};

export interface DefaultGalleryItemInput {
  id: string;
  title: string;
  caption: string;
  category: GalleryCategoryType;
  mediaType?: MediaAssetType;
  approvalStatus?: PublicApprovalStatus;
  specs: string;
  src: string;
  alt: string;
  sortOrder: number;
  active: boolean;
}

export const DEFAULT_GALLERY_ITEMS: ReadonlyArray<DefaultGalleryItemInput> = [
  {
    id: 'editorial_noir',
    title: 'Série Atelier Noir',
    caption:
      'Produção principal em alfaiataria de seda preta sob iluminação arquitetônica âmbar.',
    category: 'editorial',
    specs: 'Leica 50mm · f/1.4 · Luz Quente',
    src: '/src/assets/images/gallery_editorial_noir_1794948582472.jpg',
    alt: 'Lorena Noir em retrato editorial no ateliê com blazer preto de seda',
    sortOrder: 1,
    active: true,
  },
  {
    id: 'atelier_vertical',
    title: 'Luz Natural e Veludo',
    caption:
      'Composição vertical junto às cortinas de veludo escuro em iluminação suave de fim de tarde.',
    category: 'editorial',
    specs: 'Formato 3:4 · Luz Difusa de Janela',
    src: '/src/assets/images/gallery_atelier_candle_1794948583357.jpg',
    alt: 'Lorena Noir em vestido longo preto junto a cortina de veludo no estúdio',
    sortOrder: 2,
    active: true,
  },
  {
    id: 'close_portrait',
    title: 'Retrato Aproximado',
    caption:
      'Enquadramento íntimo de câmera com foco nítido e textura cinematográfica 35mm.',
    category: 'portraits',
    specs: '35mm · Grão Natural · Rim Âmbar',
    src: '/src/assets/images/gallery_close_portrait_1794948582088.jpg',
    alt: 'Retrato em close-up editorial de Lorena Noir com iluminação âmbar',
    sortOrder: 3,
    active: true,
  },
  {
    id: 'studio_hero',
    title: 'Transmissão ao Vivo 1-para-1',
    caption:
      'Enquadramento real da bancada de videochamadas com áudio tratado e vídeo em alta definição.',
    category: 'portraits',
    specs: 'Câmera Principal · Áudio Studio HD',
    src: '/src/assets/images/model_studio_hero_1794946401293.jpg',
    alt: 'Lorena Noir pronta para atendimento por videochamada ao vivo no estúdio',
    sortOrder: 4,
    active: true,
  },
  {
    id: 'private_suite',
    title: 'Cabine de Transmissão 4K',
    caption:
      'Óptica mirrorless dedicada e mesa em nogueira escura preparados para sessões privadas.',
    category: 'studio',
    specs: 'Sensor Full-Frame · Lente Prime',
    src: '/src/assets/images/gallery_private_suite_1794948582898.jpg',
    alt: 'Cabine privada de transmissão com câmera cinema e luminária âmbar do estúdio',
    sortOrder: 5,
    active: true,
  },
  {
    id: 'lounge_backdrop',
    title: 'Salão Model Gat Brasil',
    caption:
      'Ambiente reservado do estúdio com acústica tratada e atmosfera acolhedora para conversas exclusivas.',
    category: 'studio',
    specs: 'Sala Privada · Acústica Tratada',
    src: '/src/assets/images/studio_backdrop_lounge_1794946401840.jpg',
    alt: 'Ambiente interno do salão privado Model Gat Brasil',
    sortOrder: 6,
    active: true,
  },
];

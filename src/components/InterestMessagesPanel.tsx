import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  Inbox,
  PhoneCall,
  Trash2,
} from 'lucide-react';
import type {
  InterestMessage,
  InterestMessageStatus,
  PresencePeer,
} from '../types/studio';

interface InterestMessagesPanelProps {
  messages: InterestMessage[];
  peers: PresencePeer[];
  onUpdateStatus: (
    messageId: string,
    status: InterestMessageStatus
  ) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onDirectCallUser: (target: {
    uid: string;
    displayName: string;
    photoUrl?: string;
  }) => Promise<void>;
}

type MessageFilter = 'all' | 'unread' | 'contacted';

const STATUS_LABEL: Record<InterestMessageStatus, string> = {
  unread: 'Não lida',
  reviewed: 'Visualizada',
  contacted: 'Retornada',
};

function formatDate(msg: InterestMessage) {
  const date = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export const InterestMessagesPanel: React.FC<InterestMessagesPanelProps> = ({
  messages,
  peers,
  onUpdateStatus,
  onDeleteMessage,
  onDirectCallUser,
}) => {
  const [filter, setFilter] = useState<MessageFilter>('all');

  const onlineMap = useMemo(() => {
    const map = new Map<string, PresencePeer>();
    for (const p of peers) {
      map.set(p.uid, p);
    }
    return map;
  }, [peers]);

  const unreadCount = useMemo(
    () => messages.filter((m) => m.status === 'unread').length,
    [messages]
  );

  const filtered = useMemo(() => {
    if (filter === 'unread') {
      return messages.filter((m) => m.status === 'unread');
    }
    if (filter === 'contacted') {
      return messages.filter((m) => m.status === 'contacted');
    }
    return messages;
  }, [messages, filter]);

  return (
    <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Inbox className="w-4 h-4 text-[#F4C2D7] shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-[#FAF4F7]">
              Mensagens de Interesse (Enquanto Offline)
            </h2>
            <p className="text-xs text-[#C9BAC4] tabular-nums">
              {unreadCount} não lida{unreadCount === 1 ? '' : 's'} ·{' '}
              {messages.length} total
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full self-start sm:self-auto">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'unread', label: 'Não lidas' },
              { id: 'contacted', label: 'Retornadas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#281837] text-[#FAF4F7]'
                  : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center space-y-1.5">
          <p className="text-sm font-medium text-[#FAF4F7]">
            Nenhuma mensagem de interesse neste filtro.
          </p>
          <p className="text-xs text-[#C9BAC4]">
            Quando o estúdio estiver em Descanso ou Offline, as mensagens deixadas pelos internautas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#F4C2D7]/10">
          {filtered.map((item) => {
            const isOnline = onlineMap.has(item.userId);
            return (
              <div
                key={item.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {item.userPhotoUrl ? (
                    <img
                      src={item.userPhotoUrl}
                      alt={item.userName}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-[#F4C2D7]/25 shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#21142D] border border-[#F4C2D7]/25 flex items-center justify-center text-xs font-semibold text-[#F4C2D7] shrink-0 mt-0.5">
                      {item.userName.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-semibold text-[#FAF4F7]">
                        {item.userName}
                      </span>
                      <span className="text-[#938291]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[#F4C2D7]">
                        {item.preferredTime}
                      </span>
                      <span className="text-[#938291]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-[#C9BAC4]">
                        {formatDate(item)}
                      </span>
                      <span className="text-[#938291]" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={
                          item.status === 'contacted'
                            ? 'text-[#86EFAC]'
                            : item.status === 'unread'
                              ? 'text-[#FCD34D]'
                              : 'text-[#C9BAC4]'
                        }
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </div>
                    <p className="text-sm text-[#FAF4F7]/90 break-words">
                      {item.message}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isOnline && (
                    <button
                      type="button"
                      onClick={() => {
                        void onUpdateStatus(item.id, 'contacted');
                        void onDirectCallUser({
                          uid: item.userId,
                          displayName: item.userName,
                          photoUrl: item.userPhotoUrl,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Chamar agora</span>
                    </button>
                  )}

                  {item.status === 'unread' && (
                    <button
                      type="button"
                      onClick={() => void onUpdateStatus(item.id, 'reviewed')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      <span>Marcar lida</span>
                    </button>
                  )}

                  {item.status !== 'contacted' && (
                    <button
                      type="button"
                      onClick={() => void onUpdateStatus(item.id, 'contacted')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#86EFAC] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Marcar retornada</span>
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label={`Remover mensagem de ${item.userName}`}
                    onClick={() => void onDeleteMessage(item.id)}
                    className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

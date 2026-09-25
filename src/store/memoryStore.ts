import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SmellMemory, Season, SmellType, Emotion, MemoryRelation } from '../utils/constants';
import { MAX_RELATIONS } from '../utils/constants';
import { generateId, validateRelation } from '../utils/helpers';
import { mockMemories } from '../data/mockData';

export interface MemoryInput {
  location: string;
  source_guess: string;
  intensity: number;
  humidity: number;
  season: Season;
  smell_type: SmellType;
  memory_text: string;
  color_association: string;
  emotion: Emotion;
  want_again: boolean;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

// 保存前整体校验：数量、自关联、重复、目标存在、类型规则
function checkRelations(
  self: SmellMemory,
  memories: SmellMemory[],
  relations: MemoryRelation[],
): string | null {
  if (relations.length > MAX_RELATIONS) return `最多只能关联 ${MAX_RELATIONS} 条记忆`;
  const seen = new Set<string>();
  for (const rel of relations) {
    if (rel.targetId === self.id) return '不能关联自己';
    if (seen.has(rel.targetId)) return '同一段记忆只能关联一次';
    seen.add(rel.targetId);
    const target = memories.find((m) => m.id === rel.targetId);
    if (!target) return '关联的记忆不存在';
    const err = validateRelation(self, target, rel.type);
    if (err) return err;
  }
  return null;
}

// 整体替换 self 的关系列表，并在对方卡片上同步挂载/移除反向关系
function syncRelations(
  memories: SmellMemory[],
  selfId: string,
  relations: MemoryRelation[],
): SmellMemory[] {
  const stripped = memories.map((m) => {
    if (m.id === selfId) return { ...m, relations };
    const kept = (m.relations ?? []).filter((r) => r.targetId !== selfId);
    return kept.length === (m.relations ?? []).length ? m : { ...m, relations: kept };
  });
  return stripped.map((m) => {
    const rel = relations.find((r) => r.targetId === m.id);
    if (!rel) return m;
    return { ...m, relations: [...(m.relations ?? []), { targetId: selfId, type: rel.type }] };
  });
}

interface MemoryStore {
  memories: SmellMemory[];
  addMemory: (input: MemoryInput, relations: MemoryRelation[]) => SaveResult;
  updateMemory: (id: string, input: MemoryInput, relations: MemoryRelation[]) => SaveResult;
  deleteMemory: (id: string) => void;
  initIfEmpty: () => void;
}

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      memories: [],
      addMemory: (input, relations) => {
        const now = new Date().toISOString();
        const newMem: SmellMemory = {
          id: generateId(),
          ...input,
          relations: [],
          created_at: now,
          updated_at: now,
        };
        const err = checkRelations(newMem, get().memories, relations);
        if (err) return { ok: false, error: err };
        const withSelf = [newMem, ...get().memories];
        set({ memories: syncRelations(withSelf, newMem.id, relations) });
        return { ok: true };
      },
      updateMemory: (id, input, relations) => {
        const current = get().memories.find((m) => m.id === id);
        if (!current) return { ok: false, error: '这段记忆不存在' };
        // 用修改后的属性校验关系，任何一条不合规则就整体放弃，原有关系保持不动
        const prospective: SmellMemory = { ...current, ...input };
        const err = checkRelations(prospective, get().memories, relations);
        if (err) return { ok: false, error: err };
        const updated = get().memories.map((m) =>
          m.id === id
            ? { ...m, ...input, updated_at: new Date().toISOString() }
            : m,
        );
        set({ memories: syncRelations(updated, id, relations) });
        return { ok: true };
      },
      deleteMemory: (id) => {
        set({
          memories: get()
            .memories.filter((m) => m.id !== id)
            .map((m) => {
              const kept = (m.relations ?? []).filter((r) => r.targetId !== id);
              return kept.length === (m.relations ?? []).length ? m : { ...m, relations: kept };
            }),
        });
      },
      initIfEmpty: () => {
        if (get().memories.length === 0) {
          set({ memories: mockMemories });
        }
      },
    }),
    {
      name: 'scent-memory-storage',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState) => {
        // 旧数据没有 relations 字段，迁移时补上空数组
        const state = persistedState as { memories?: SmellMemory[] } | undefined;
        if (state && Array.isArray(state.memories)) {
          state.memories = state.memories.map((m) => ({ relations: [], ...m }));
        }
        return state as unknown as MemoryStore;
      },
    },
  ),
);

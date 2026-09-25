import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SmellMemory, Season, SmellType, Emotion, MemoryRelation } from '../utils/constants';
import { generateId, validateRelations, MAX_RELATIONS } from '../utils/helpers';
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
  relations: MemoryRelation[];
}

interface MemoryStore {
  memories: SmellMemory[];
  /** 返回 null 表示保存成功，否则为失败原因（不改动任何数据） */
  addMemory: (input: MemoryInput) => string | null;
  updateMemory: (id: string, input: MemoryInput) => string | null;
  deleteMemory: (id: string) => void;
  initIfEmpty: () => void;
}

/** 校验关系规则，并确认对方卡片还有空位挂载反向关系 */
function checkRelations(
  relations: MemoryRelation[],
  selfId: string | null,
  sourceAttrs: Pick<SmellMemory, 'smell_type' | 'season' | 'emotion'>,
  memories: SmellMemory[],
): string | null {
  const err = validateRelations(relations, selfId, sourceAttrs, memories);
  if (err) return err;
  for (const rel of relations) {
    const target = memories.find(m => m.id === rel.target_id)!;
    const occupied = target.relations.filter(r => r.target_id !== selfId).length;
    if (occupied + 1 > MAX_RELATIONS) {
      return `「${target.location}」的关联已满（最多 ${MAX_RELATIONS} 条），无法再挂载`;
    }
  }
  return null;
}

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      memories: [],
      addMemory: (input) => {
        const memories = get().memories;
        const err = checkRelations(input.relations, null, input, memories);
        if (err) return err;

        const now = new Date().toISOString();
        const newMem: SmellMemory = {
          id: generateId(),
          ...input,
          created_at: now,
          updated_at: now,
        };
        // 关系同时挂到对方卡片上
        const others = memories.map((m) => {
          const incoming = input.relations.find((r) => r.target_id === m.id);
          return incoming
            ? { ...m, relations: [...m.relations, { target_id: newMem.id, type: incoming.type }] }
            : m;
        });
        set({ memories: [newMem, ...others] });
        return null;
      },
      updateMemory: (id, input) => {
        const memories = get().memories;
        const existing = memories.find((m) => m.id === id);
        if (!existing) return '这条记忆不存在';
        const err = checkRelations(input.relations, id, input, memories);
        if (err) return err;

        const now = new Date().toISOString();
        set({
          memories: memories.map((m) => {
            if (m.id === id) {
              return { ...m, ...input, updated_at: now };
            }
            // 只同步与本次编辑相关的反向关系，其余关系原样保留
            const prev = m.relations.find((r) => r.target_id === id);
            const incoming = input.relations.find((r) => r.target_id === m.id);
            if (!prev && !incoming) return m;
            if (prev && incoming && prev.type === incoming.type) return m;
            const relations = m.relations.filter((r) => r.target_id !== id);
            if (incoming) relations.push({ target_id: id, type: incoming.type });
            return { ...m, relations };
          }),
        });
        return null;
      },
      deleteMemory: (id) => {
        set({
          memories: get().memories
            .filter((m) => m.id !== id)
            // 另一边的卡片跟着清理掉指向它的关系
            .map((m) =>
              m.relations.some((r) => r.target_id === id)
                ? { ...m, relations: m.relations.filter((r) => r.target_id !== id) }
                : m,
            ),
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
      migrate: (persisted) => {
        // 旧数据没有 relations 字段，补上空数组
        const state = persisted as { memories?: SmellMemory[] };
        if (state && Array.isArray(state.memories)) {
          state.memories = state.memories.map((m) => ({ relations: [], ...m }));
        }
        return state;
      },
    },
  ),
);

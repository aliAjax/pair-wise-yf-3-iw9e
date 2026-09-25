import type { SmellMemory, MemoryRelation, RelationType } from './constants';
import { RELATION_TYPES } from './constants';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export interface Filters {
  smellType: string;
  season: string;
  emotion: string;
  relation: string;
}

export function hasActiveFilters(filters: Filters): boolean {
  return !!(filters.smellType || filters.season || filters.emotion || filters.relation);
}

export function filterMemories(memories: SmellMemory[], filters: Filters): SmellMemory[] {
  return memories.filter(m => {
    if (filters.smellType && m.smell_type !== filters.smellType) return false;
    if (filters.season && m.season !== filters.season) return false;
    if (filters.emotion && m.emotion !== filters.emotion) return false;
    if (filters.relation === 'any') {
      if (m.relations.length === 0) return false;
    } else if (filters.relation) {
      if (!m.relations.some(r => r.type === filters.relation)) return false;
    }
    return true;
  });
}

/* ---------- 关系网 ---------- */

export const MAX_RELATIONS = 3;

type RelationAttrs = Pick<SmellMemory, 'smell_type' | 'season' | 'emotion'>;

/** 校验单条关系是否满足规则，返回错误信息；合法时返回 null */
export function validateRelation(source: RelationAttrs, target: RelationAttrs, type: RelationType): string | null {
  switch (type) {
    case 'similar':
      return source.smell_type === target.smell_type
        ? null
        : '「相似」要求两条记忆的气味类型一致';
    case 'continuation':
      return source.season === target.season
        ? null
        : '「延续」要求两条记忆的季节相同';
    case 'contrast':
      return source.emotion !== target.emotion
        ? null
        : '「反差」要求两条记忆的情绪不同';
  }
}

/** 找出对某个目标可用的关系类型（可能一个都不满足） */
export function validRelationTypes(source: RelationAttrs, target: RelationAttrs): RelationType[] {
  return RELATION_TYPES
    .map(t => t.value)
    .filter(t => validateRelation(source, target, t) === null);
}

/** 校验一整组关系（条数、重复、自引用、规则），合法时返回 null */
export function validateRelations(
  relations: MemoryRelation[],
  selfId: string | null,
  sourceAttrs: RelationAttrs,
  memories: SmellMemory[],
): string | null {
  if (relations.length > MAX_RELATIONS) return `最多只能关联 ${MAX_RELATIONS} 条记忆`;
  const seen = new Set<string>();
  for (const rel of relations) {
    if (rel.target_id === selfId) return '不能关联记忆自己';
    if (seen.has(rel.target_id)) return '同一条记忆只能关联一次';
    seen.add(rel.target_id);
    const target = memories.find(m => m.id === rel.target_id);
    if (!target) return '关联的记忆不存在，可能已被删除';
    const err = validateRelation(sourceAttrs, target, rel.type);
    if (err) return `与「${target.location}」的关系不成立：${err}`;
  }
  return null;
}

/** 按三种关系统计数量（双向挂载的同一条关系只计一次） */
export function getRelationCounts(memories: SmellMemory[]): Record<RelationType, number> {
  const counts: Record<RelationType, number> = { similar: 0, continuation: 0, contrast: 0 };
  const seen = new Set<string>();
  for (const m of memories) {
    for (const r of m.relations) {
      const key = [m.id, r.target_id].sort().join('|') + '#' + r.type;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[r.type] += 1;
    }
  }
  return counts;
}

export interface IntensityDistribution {
  bucket: string;
  count: number;
  range: [number, number];
}

export function getIntensityDistribution(memories: SmellMemory[]): IntensityDistribution[] {
  const buckets = [
    { bucket: '1-2', range: [1, 2] as [number, number] },
    { bucket: '3-4', range: [3, 4] as [number, number] },
    { bucket: '5-6', range: [5, 6] as [number, number] },
    { bucket: '7-8', range: [7, 8] as [number, number] },
    { bucket: '9-10', range: [9, 10] as [number, number] },
  ];
  return buckets.map(b => ({
    ...b,
    count: memories.filter(m => m.intensity >= b.range[0] && m.intensity <= b.range[1]).length,
  }));
}

export function getAverageIntensity(memories: SmellMemory[]): number {
  if (!memories.length) return 0;
  const sum = memories.reduce((acc, m) => acc + m.intensity, 0);
  return Math.round((sum / memories.length) * 10) / 10;
}

export function getTopIntensityMemories(memories: SmellMemory[], n = 5): SmellMemory[] {
  return [...memories].sort((a, b) => b.intensity - a.intensity).slice(0, n);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

export function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

export function contrastTextColor(hex: string): string {
  return isLightColor(hex) ? '#2A2118' : '#FBF7EE';
}

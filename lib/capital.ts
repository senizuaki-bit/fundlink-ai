import { funds, matchEntity } from "./catalog";
import type { Profile, Workspace } from "./model";

export type CapitalFilters = {
  query: string;
  sector: string;
  stage: string;
  region: string;
  ticket: string;
  resource: string;
  type: string;
  eligibleOnly: boolean;
};
export type CapitalSearch = { id: string; time: string; filters: CapitalFilters; ids: string[] };
export const capitalSectors = ["人工智能", "机器人", "企业服务", "新能源", "医疗科技", "半导体"];
export const capitalStages = ["种子轮", "天使轮", "Pre-A 轮", "A 轮", "B 轮", "成长期"];
export const capitalResources = ["产业客户", "销售渠道", "供应链资源", "技术支持", "长期陪伴", "国际化经验"];
export const emptyCapitalFilters = (): CapitalFilters => ({ query: "", sector: "", stage: "", region: "", ticket: "", resource: "", type: "", eligibleOnly: false });

export function capitalFiltersForProfile(profile: Profile): CapitalFilters {
  const a = profile.answers;
  const sectors = capitalSectors.filter(s => a.sector?.includes(s));
  // An A-round label must not also match the A inside Pre-A.
  const normalized = a.stage?.replaceAll("Pre-A 轮", "PreA轮") || "";
  const stages = capitalStages.filter(s => normalized.includes(s === "Pre-A 轮" ? "PreA轮" : s));
  const regions = ["中国", "东南亚", "美国"].filter(s => a.region?.includes(s));
  return {
    ...emptyCapitalFilters(),
    sector: sectors.length === 1 ? sectors[0] : "",
    stage: stages.length === 1 ? stages[0] : "",
    region: regions.length === 1 && !a.region?.includes("全球") ? regions[0] : "",
    // Total round size is not the same as the desired cheque from one institution.
  };
}

export function capitalFilterError(filters: CapitalFilters): string | null {
  if (filters.ticket.trim() && (!/^\d+(?:\.\d+)?$/.test(filters.ticket.trim()) || !Number.isFinite(Number(filters.ticket)) || Number(filters.ticket) <= 0)) {
    return "请输入大于 0 的单家出资额，单位为人民币万元。";
  }
  return null;
}

export function findCapital(filters: CapitalFilters, workspace: Workspace) {
  if (capitalFilterError(filters)) return [];
  const query = filters.query.trim().toLowerCase();
  const ticket = filters.ticket.trim() ? Number(filters.ticket) : null;
  return funds.filter(fund =>
    (!query || [fund.name, fund.en, fund.desc, fund.sector, ...fund.resources].join(" ").toLowerCase().includes(query)) &&
    (!filters.sector || fund.sector === filters.sector) &&
    (!filters.stage || fund.stages.includes(filters.stage)) &&
    (!filters.region || filters.region === "全球" || fund.region === filters.region || fund.region === "全球") &&
    (!filters.type || fund.tags.includes(filters.type)) &&
    (!filters.resource || fund.resources.includes(filters.resource)) &&
    (ticket === null || (fund.min <= ticket && ticket <= fund.max))
  ).map(fund => ({ fund, match: matchEntity(fund, workspace, "founder") }))
    .filter(result => !filters.eligibleOnly || result.match.eligible)
    .sort((a, b) => Number(b.match.eligible) - Number(a.match.eligible) || b.match.score - a.match.score);
}

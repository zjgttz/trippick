/**
 * 全局客户端状态：分析结果 + 用户决策 + 协同视图。
 * 持久化到 sessionStorage，刷新不丢。
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AnalysisResult, ItineraryDay } from "./schema";

export type DecisionStatus = "accepted" | "pending" | "rejected" | "unset";

interface TripPickState {
  analysis: AnalysisResult | null;
  /** POI 名称 → 决策状态 */
  decisions: Record<string, DecisionStatus>;
  /** 协同模式下来自伙伴的选择（只读） */
  partnerDecisions: Record<string, DecisionStatus> | null;
  /** 用户手动调整后的行程，未调整时为 null（用 analysis.itinerary_suggestion） */
  customItinerary: ItineraryDay[] | null;

  setAnalysis: (a: AnalysisResult) => void;
  setDecision: (name: string, status: DecisionStatus) => void;
  resetDecisions: () => void;
  setPartnerDecisions: (d: Record<string, DecisionStatus> | null) => void;
  setCustomItinerary: (it: ItineraryDay[] | null) => void;
  clearAll: () => void;
}

export const useTripPickStore = create<TripPickState>()(
  persist(
    (set) => ({
      analysis: null,
      decisions: {},
      partnerDecisions: null,
      customItinerary: null,

      setAnalysis: (a) =>
        set({
          analysis: a,
          decisions: {},
          customItinerary: null,
          partnerDecisions: null,
        }),
      setDecision: (name, status) =>
        set((s) => ({ decisions: { ...s.decisions, [name]: status } })),
      resetDecisions: () => set({ decisions: {} }),
      setPartnerDecisions: (d) => set({ partnerDecisions: d }),
      setCustomItinerary: (it) => set({ customItinerary: it }),
      clearAll: () =>
        set({
          analysis: null,
          decisions: {},
          partnerDecisions: null,
          customItinerary: null,
        }),
    }),
    {
      name: "trippick-state",
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? (undefined as unknown as Storage)
          : sessionStorage
      ),
    }
  )
);

// ============ Selectors ============

export function getAcceptedItems(
  decisions: Record<string, DecisionStatus>
): string[] {
  return Object.entries(decisions)
    .filter(([, s]) => s === "accepted")
    .map(([n]) => n);
}

export function getPendingItems(
  decisions: Record<string, DecisionStatus>
): string[] {
  return Object.entries(decisions)
    .filter(([, s]) => s === "pending")
    .map(([n]) => n);
}

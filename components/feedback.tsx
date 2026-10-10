"use client";
import {PreferencesPanel} from "./preferences";
import {SectionHead} from "./ui";
import type {SectionProps} from "./workspace";

/** Compatibility surface; platform learning is not a customer workspace module. */
export function FeedbackPanel(p:SectionProps){
 return <><SectionHead kicker="YOUR PREFERENCES" title="偏好与反馈" text="管理推荐偏好、使用记录和授权范围。"/><PreferencesPanel {...p}/></>;
}

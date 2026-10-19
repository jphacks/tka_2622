import type { Metadata } from "next";
import { GuestModeApp } from "../../components/guest/GuestModeApp";

export const metadata: Metadata = { title: "ゲストモード" };

export default function GuestPage() {
  return <GuestModeApp />;
}

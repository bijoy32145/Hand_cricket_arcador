// lib/ably.ts
import { Realtime } from 'ably';

let ably: Realtime | null = null;

if (typeof window !== 'undefined') {
  ably = new Realtime({ key: process.env.NEXT_PUBLIC_ABLY_API_KEY! });
}

export default ably;

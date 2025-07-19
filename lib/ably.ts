// lib/ably.ts
import { Realtime } from 'ably';

const ably = new Realtime({ key: process.env.NEXT_PUBLIC_ABLY_API_KEY! });

export default ably;

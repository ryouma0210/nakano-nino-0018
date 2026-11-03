import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRoomVoicePreferenceStore } from "./roomVoiceSelection";

export const roomVoiceStore = createRoomVoicePreferenceStore(AsyncStorage);

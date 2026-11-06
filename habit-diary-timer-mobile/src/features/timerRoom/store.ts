import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPersistentTimerRoomStore } from "./session";

export const timerRoomStore = createPersistentTimerRoomStore(AsyncStorage);

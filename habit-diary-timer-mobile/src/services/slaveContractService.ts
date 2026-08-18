import AsyncStorage from "@react-native-async-storage/async-storage";
import { realContractSchema } from "@/schemas/storage";
import { parseStoredJson } from "@/utils/storageValidation";

const CONTRACT_STORAGE_KEY = "nino-room:real-slave-contract";

export type StoredRealContract = {
  contractorName?: string;
  contractDate?: string;
  releaseMonths?: number;
};

export const slaveContractService = {
  async load(): Promise<StoredRealContract> {
    const raw = await AsyncStorage.getItem(CONTRACT_STORAGE_KEY);
    if (!raw) return {};
    return parseStoredJson(raw, realContractSchema, {});
  },

  async save(value: StoredRealContract) {
    await AsyncStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(value));
  },

  async clear() {
    await AsyncStorage.removeItem(CONTRACT_STORAGE_KEY);
  },
};

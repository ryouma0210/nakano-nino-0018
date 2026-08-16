import AsyncStorage from "@react-native-async-storage/async-storage";

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
    try {
      return JSON.parse(raw) as StoredRealContract;
    } catch {
      await AsyncStorage.removeItem(CONTRACT_STORAGE_KEY);
      return {};
    }
  },

  async save(value: StoredRealContract) {
    await AsyncStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(value));
  },

  async clear() {
    await AsyncStorage.removeItem(CONTRACT_STORAGE_KEY);
  },
};

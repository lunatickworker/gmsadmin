// 게임사 서비스 팩토리

import type { IGameProviderService, IGameProviderServiceFactory } from "./game-provider.interface";
import { InvestProviderService } from "./invest-provider.service";
import { HonorProviderService } from "./honor-provider.service";
import { AceProviderService } from "./ace-provider.service";
import type { ProviderType } from "../types/game-provider.types";

export class GameProviderServiceFactory implements IGameProviderServiceFactory {
  private static instance: GameProviderServiceFactory;
  private services: Map<ProviderType, IGameProviderService>;

  private constructor() {
    this.services = new Map();
    this.initializeServices();
  }

  public static getInstance(): GameProviderServiceFactory {
    if (!GameProviderServiceFactory.instance) {
      GameProviderServiceFactory.instance = new GameProviderServiceFactory();
    }
    return GameProviderServiceFactory.instance;
  }

  private initializeServices(): void {
    this.services.set("invest", new InvestProviderService());
    this.services.set("honor", new HonorProviderService());
    this.services.set("ace", new AceProviderService());
  }

  public getService(providerType: ProviderType): IGameProviderService {
    const service = this.services.get(providerType);
    if (!service) {
      throw new Error(`Unknown provider type: ${providerType}`);
    }
    return service;
  }

  // 새로운 게임사를 추가할 때 사용
  public registerService(providerType: ProviderType, service: IGameProviderService): void {
    this.services.set(providerType, service);
  }
}

// 편의를 위한 헬퍼 함수
export const getGameProviderService = (providerType: ProviderType): IGameProviderService => {
  return GameProviderServiceFactory.getInstance().getService(providerType);
};

// Export as default for easier importing
export const GameProviderFactory = {
  getService: (providerType: ProviderType): IGameProviderService => {
    return GameProviderServiceFactory.getInstance().getService(providerType);
  },
  getInstance: () => GameProviderServiceFactory.getInstance(),
};

export interface ServiceData {
    name: string;
    slug: string;
    description: string;
    durationMinutes: number;
    priceCents: number | null;
    priceNote: string | null;
    promoGroup?: string | null;
    displayOrder: number;
}
export interface CategoryData {
    name: string;
    description: string;
    displayOrder: number;
    services: ServiceData[];
}
export declare const CLIENT_SERVICE_CATALOG: CategoryData[];
export declare function importServiceCatalog(): Promise<void>;
//# sourceMappingURL=import-client-service-catalog.d.ts.map
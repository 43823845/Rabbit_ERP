declare module '../../shared/report-formulas.cjs' {
  export interface ReportRow {
    row_no: number;
    name: string;
    amount: number;
    opening_amount: number;
    monthly_amount?: number;
    is_header: boolean;
    is_total: boolean;
    bold: boolean;
    indent_level: number;
    section: string;
    children: any[];
  }

  export function fillTemplateAmount(
    templateRows: any[],
    balanceMap: Map<string, any>,
    openingMap: Map<string, any>,
    monthlyMap?: Map<string, any> | null,
    opts?: { netProfitAmount?: number }
  ): ReportRow[];

  export function classifyCashFlowCategory(
    subjectCode: string,
    subjectInfo: { category: string } | null | undefined
  ): 'operating' | 'investing' | 'financing';
}

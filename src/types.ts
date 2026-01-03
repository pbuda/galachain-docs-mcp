export interface DocChunk {
  title: string;
  content: string;
  headingLevel: number;
  package: string;
  category: string;
  filePath: string;
  sourceUrl: string;
}

export interface ClassInfo {
  name: string;
  package: string;
  type: 'class' | 'interface' | 'type' | 'enum' | 'function';
  description: string;
  extendsClause: string | null;
  implementsClause: string[];
  decorators: string[];
  members: MemberInfo[];
  filePath: string;
  sourceUrl: string;
}

export interface MemberInfo {
  name: string;
  type: 'method' | 'property' | 'constructor' | 'accessor';
  signature: string;
  visibility: 'public' | 'protected' | 'private';
  isStatic: boolean;
  isAsync: boolean;
  description: string;
  params: ParamInfo[];
  returns: { type: string; description: string } | null;
  decorators: string[];
  exampleCode: string | null;
}

export interface ParamInfo {
  name: string;
  type: string;
  description: string;
  optional: boolean;
}

export interface SearchResult {
  id: number;
  title: string;
  snippet: string;
  package: string;
  category: string;
  type: string;
  sourceUrl: string;
  rank: number;
}

export interface ClassWithMembers {
  id: number;
  name: string;
  package: string;
  type: string;
  description: string;
  extendsClause: string | null;
  implementsClause: string[];
  decorators: string[];
  sourceUrl: string;
  members: MemberWithDetails[];
}

export interface MemberWithDetails {
  id: number;
  name: string;
  type: string;
  signature: string;
  visibility: string;
  isStatic: boolean;
  isAsync: boolean;
  description: string;
  params: ParamInfo[];
  returns: { type: string; description: string } | null;
  decorators: string[];
  exampleCode: string | null;
  className?: string;
  package?: string;
  sourceUrl?: string;
}

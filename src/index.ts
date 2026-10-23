export {
  CONFIG_FILES,
  ConfigError,
  findConfigFile,
  loadConfig,
  resolveConfig,
  type Config,
  type ResolvedConfig,
  type RuleSetting,
} from './config.js';
export { extract, getExtractor, SUPPORTED_EXTENSIONS } from './extractors/index.js';
export { DEFAULT_IGNORE, findFiles } from './files.js';
export { lintFiles, lintText, type Issue, type LintResult, type LintTextOptions } from './linter.js';
export { formatters, type Formatter } from './reporters/index.js';
export {
  rules,
  ruleMap,
  type Rule,
  type RuleContext,
  type RuleReport,
  type Severity,
  type SeveritySetting,
} from './rules/index.js';
export type { Segment, SegmentKind } from './text/segment.js';
export { splitSentences, type Sentence } from './text/sentence.js';

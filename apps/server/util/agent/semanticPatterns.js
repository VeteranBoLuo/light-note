/**
 * 跨编译器与能力路由共享的用户语义边界。
 *
 * 这些表达式只识别用户明确声明的交互模式，不决定具体工具；TurnSpec 与
 * capability router 仍分别负责意图协议和能力选择，避免两层规则漂移。
 */
export const EXPLICIT_PREVIEW_ONLY_PATTERN =
  /(?:(?:只|仅)(?:要|需|需要|做|进行|查看|给我)?\s*(?:预览|模拟|试算|演示)|(?:预览|模拟|试算|演示)(?:即可|就好|就行)|(?:不要|无需|不需要|别)(?:创建|执行|保存|写入|修改|提交).{0,24}(?:只|仅)?(?:预览|模拟|试算|演示)|(?:只|仅)?(?:预览|模拟|试算|演示).{0,24}(?:不要|无需|不需要|别)(?:创建|执行|保存|写入|修改|提交)|(?:preview|dry[ -]?run|simulate)(?:\s+only)?|(?:do\s+not|don't)\s+(?:create|execute|save|write|modify).{0,32}(?:preview|dry[ -]?run|simulate))/iu;

export const EPHEMERAL_REPORT_PATTERN =
  /(?:(?:生成|整理|总结|分析|查看|看看|给我|做(?:一份|一个)?).{0,40}(?:回顾|复盘|摘要|概览|分析|报告)|(?:回顾|复盘|摘要|概览|分析|报告).{0,24}(?:一下|看看|给我|生成|整理|总结)|(?:generate|show|summari[sz]e|analy[sz]e|review).{0,48}(?:recap|review|summary|overview|analysis|report))/iu;

export const PERSISTED_ARTIFACT_PATTERN =
  /(?:(?:创建|新建|保存|写入|存入|记录到|发布|导出|上传|生成|产出|做成).{0,32}(?:笔记|文档|文件|待办|任务|书签|知识库|云空间)|(?:笔记|文档|文件|待办|任务|书签|知识库|云空间).{0,32}(?:创建|新建|保存|写入|存入|发布|导出|上传|生成|产出)|(?:create|save|write|export|upload|publish|turn).{0,48}(?:note|document|file|todo|task|bookmark|knowledge\s+base))/iu;

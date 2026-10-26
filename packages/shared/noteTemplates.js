// Built-in document bodies shared by the picker, note creation and visitor examples.
// These are trusted product-authored HTML/Markdown, never a renderer for user input.
const p = (text) => `<p>${text}</p>`;
const hint = (text) => `<p class="ln-note-hint">${text}</p>`;
const heading = (text, side = "") =>
  `<div class="ln-note-section-title"><h2>${text}</h2>${side ? `<span>${side}</span>` : ""}</div>`;
const block = (title, body, style = "", side = "") =>
  `<div class="ln-note-block${style ? ` ln-note-${style}` : ""}">${heading(title, side)}${body}</div>`;
const columns = (body, style = "equal") =>
  `<div class="ln-note-${style}-columns">${body}</div>`;
const tasks = (rows) =>
  `<div class="ln-note-tasks">${rows.map(([done, text]) => `<p><input type="checkbox" class="note-todo-checkbox" data-note-task="true"${done ? " checked" : ""}> ${text}</p>`).join("")}</div>`;
const list = (rows) =>
  `<ol>${rows.map((text) => `<li>${text}</li>`).join("")}</ol>`;
const table = (headers, rows) =>
  `<div class="ln-note-table-scroll"><table><thead><tr>${headers.map((text) => `<th>${text}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((text) => `<td>${text}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const head = (title, meta, description = "") =>
  `<div class="ln-note-head"><div><h1>${title}</h1>${description ? p(description) : ""}</div><p class="ln-note-date">${meta}</p></div>`;
const footer = (title, text) =>
  `<p class="ln-note-closing"><strong>${title}</strong>　${text}</p>`;
const section = (title, body) =>
  `<div class="ln-note-reading-section">${heading(title)}${body}</div>`;
const page = (key, body) =>
  `<div class="note-template-page ln-note-layout ln-note-layout--${key}">${body}</div>`;

function renderHtml(key, locale, example) {
  const t = (zh, en) => (locale === "zh-CN" ? zh : en);
  const value = (prompt, sample) => (example ? sample : hint(prompt));
  const date = "{{date}}";
  if (key === "daily")
    return page(
      key,
      head(t("今天的工作", "Today's work"), `${date} · {{weekday}}`) +
        block(
          t("今日重点", "Today's focus"),
          tasks(
            example
              ? [
                  [
                    true,
                    t("完成项目说明初稿", "Finish the first project brief"),
                  ],
                  [
                    true,
                    t(
                      "把散落的参考资料放回项目",
                      "Bring scattered references into the project",
                    ),
                  ],
                  [
                    false,
                    t(
                      "确认本周讨论的时间",
                      "Confirm a time for this week’s discussion",
                    ),
                  ],
                ]
              : [
                  [
                    false,
                    t(
                      "写下今天最想推进的一件事",
                      "One thing you want to move forward today",
                    ),
                  ],
                ],
          ),
          "focus",
          t("最多 3 件", "Up to 3"),
        ) +
        columns(
          block(
            t("完成与进展", "Progress & outcomes"),
            value(
              t(
                "完成了什么？留下结果或相关资料。",
                "What moved forward? Keep the result or a useful reference.",
              ),
              `<div class="ln-note-entry"><h3>${t("项目说明已经有了第一版", "The first project brief is ready")}</h3>${p(t("补齐目标、范围和分工，待讨论后定稿。", "Goals, scope and responsibilities are ready for discussion."))}</div>` +
                `<div class="ln-note-entry"><h3>${t("资料入口整理好了", "References are now in one place")}</h3>${p(t("合并重复链接，给常用文档补了一句用途说明。", "Merged duplicate links and added a purpose to each frequently used document."))}</div>`,
            ),
          ) +
            block(
              t("卡点与协作", "Blockers & support"),
              value(
                t("有需要帮助的地方再写。", "Add this when you need help."),
                p(
                  t(
                    "还缺一份历史方案。请资料负责人补充，其他内容可以继续推进。",
                    "An earlier proposal is missing. Ask its owner for a copy; other work can continue.",
                  ),
                ),
              ),
              "side-note",
              t("选填", "Optional"),
            ),
          "daily",
        ) +
        block(
          t("明日安排", "Tomorrow"),
          tasks(
            example
              ? [
                  [
                    false,
                    t(
                      "补上历史方案，对照检查遗漏",
                      "Compare the earlier proposal and check for omissions",
                    ),
                  ],
                  [
                    false,
                    t(
                      "把讨论问题提前发给参会人",
                      "Send discussion questions to the participants",
                    ),
                  ],
                ]
              : [[false, t("从哪一步开始？", "Where will you start?")]],
          ),
          "next",
        ) +
        footer(
          t("随手记", "A quick note"),
          t(
            example
              ? "整理资料时补一句“为什么留下它”，下次更容易接着用。"
              : "留一句今天的新发现，也可以删掉这一行。",
            example
              ? "A short note about why you saved something makes it easier to use later."
              : "Keep one small discovery, or remove this line.",
          ),
        ),
    );
  if (key === "weekly")
    return page(
      key,
      head(t("本周工作回顾", "This week in review"), date) +
        `<div class="ln-note-summary"><span>${t("本周概览", "At a glance")}</span>${p(t(example ? "项目说明完成初稿，资料入口已整理。下周集中确认分工，开始小范围试用。" : "用一两句话概括本周最重要的进展。", example ? "The project brief and reference collection are ready. Next week, confirm responsibilities and try the workflow with a small group." : "Summarize the most important progress in one or two sentences."))}</div>` +
        block(
          t("本周完成", "Progress this week"),
          table(
            t(
              ["事项", "进展", "结果 / 相关资料"],
              ["Work", "Progress", "Outcome / reference"],
            ),
            example
              ? t(
                  [
                    ["项目说明", "已完成初稿", "目标与范围清楚，等待讨论定稿"],
                    ["资料归档", "已完成", "常用链接集中到项目笔记"],
                    ["小范围试用", "待开始", "先邀请 3 位同事走一遍流程"],
                  ],
                  [
                    [
                      "Project brief",
                      "Draft ready",
                      "Goals and scope are ready for review",
                    ],
                    [
                      "Reference collection",
                      "Done",
                      "Common links are in the project note",
                    ],
                    [
                      "Small trial",
                      "Not started",
                      "Invite three colleagues to try the workflow",
                    ],
                  ],
                )
              : [
                  t(
                    ["填写本周的主要事项", "已完成 / 进行中", "结果或链接"],
                    [
                      "A key item from this week",
                      "Done / in progress",
                      "Outcome or link",
                    ],
                  ),
                ],
          ),
          "open",
        ) +
        columns(
          block(
            t("问题与协作", "Issues & support"),
            value(
              t(
                "有哪些影响进度的问题？需要什么支持？",
                "What affects progress, and what help is needed?",
              ),
              p(
                t(
                  "旧资料的归属还不够清楚。下周请相关同事补充来源，避免重复整理。",
                  "Ownership of older documents is unclear. Ask colleagues to add sources before reorganizing them.",
                ),
              ),
            ),
            "quiet",
          ) +
            block(
              t("下周计划", "Next week"),
              list(
                example
                  ? t(
                      [
                        "确认分工与完成时间",
                        "试用一次资料回找流程",
                        "记录需要调整的地方",
                      ],
                      [
                        "Confirm owners and dates",
                        "Try finding a saved document",
                        "Record what needs adjustment",
                      ],
                    )
                  : [t("最优先的一件事", "Your first priority")],
              ),
              "quiet",
            ),
        ) +
        footer(
          t("一点复盘", "Reflection"),
          t(
            example
              ? "先统一命名和入口，比一次性设计很多分类更容易开始。"
              : "有什么值得继续，或下周换个做法？",
            example
              ? "Consistent names and a shared starting point made it easier to begin."
              : "What should continue, or change next week?",
          ),
        ),
    );
  if (key === "meeting")
    return page(
      key,
      head(
        t(
          example ? "项目资料整理 · 周会" : "会议主题",
          example ? "Project references · Team meeting" : "Meeting topic",
        ),
        "{{datetime}}",
      ) +
        `<p class="ln-note-meeting-meta">${t("参会人", "Participants")}：${t(example ? "研究、设计、记录者" : "姓名 / 角色", example ? "Research, design, note-taker" : "Names / roles")}　·　${t("记录人", "Notes by")}：${t(example ? "记录者" : "姓名", example ? "Note-taker" : "Name")}</p>` +
        block(
          t("已确认决定", "Confirmed decisions"),
          value(
            t("这次会议确定了什么？", "What was agreed?"),
            list(
              t(
                [
                  "先整理现有资料，不增加新的分类层级。",
                  "由各资料负责人补齐来源，再进行一次试用。",
                ],
                [
                  "Organize existing references before adding categories.",
                  "Ask owners to add sources, then run a small trial.",
                ],
              ),
            ),
          ),
          "decision",
        ) +
        block(
          t("行动项", "Action items"),
          table(
            t(["要做什么", "负责人", "完成时间"], ["Action", "Owner", "Due"]),
            example
              ? t(
                  [
                    ["补齐历史方案与来源", "研究", "下一次讨论前"],
                    ["整理试用问题清单", "设计", "试用前"],
                    ["汇总反馈，更新项目说明", "记录者", "试用后"],
                  ],
                  [
                    [
                      "Add earlier proposals and sources",
                      "Research",
                      "Before the next meeting",
                    ],
                    ["Prepare trial questions", "Design", "Before the trial"],
                    [
                      "Summarize feedback and update the brief",
                      "Note-taker",
                      "After the trial",
                    ],
                  ],
                )
              : [
                  t(
                    ["填写具体行动", "姓名", "日期"],
                    ["A specific action", "Name", "Date"],
                  ),
                ],
          ),
          "open",
        ) +
        block(
          t("讨论记录", "Discussion"),
          value(
            t(
              "按议题记下重要理由，不必逐字记录。",
              "Keep the important reasoning for each topic.",
            ),
            `<h3>${t("资料应该如何分类？", "How should references be organized?")}</h3>${p(t("先按项目归拢。暂时无法确定用途的内容保留在待整理，避免为了归档而反复改分类。", "Group references by project. Keep items with an unclear purpose in the inbox until their use becomes clear."))}`,
          ),
          "open",
        ) +
        footer(
          t("待确认", "Open question"),
          t(
            example
              ? "是否需要单独保留历史版本，下次结合试用反馈再决定。"
              : "留下尚未达成一致的问题。",
            example
              ? "Decide how to retain older versions after reviewing trial feedback."
              : "Keep questions that are still unresolved.",
          ),
        ),
    );
  if (key === "reading")
    return page(
      key,
      head(
        t(
          example ? "让笔记成为下一次思考的起点" : "书名 / 文章标题",
          example
            ? "A starting point for your next thought"
            : "Book / article title",
        ),
        date,
        t(
          example ? "阅读练习 · 示例短文" : "作者 · 阅读章节 / 来源",
          example
            ? "Reading practice · Example passage"
            : "Author · Chapter / source",
        ),
      ) +
        `<p class="ln-note-reading-intro">${t(example ? "不必把读过的内容全部搬进笔记。留下一句触动自己的话，再补上它和生活的联系，就有了下次继续思考的入口。" : "这次最想记住的一点……", example ? "Keep a passage that matters to you, then connect it to your own experience. It gives you somewhere to begin next time." : "The one thing you want to remember…")}</p>` +
        section(
          t("值得留下的摘录", "A passage to keep"),
          `<blockquote>${p(t(example ? "一份有用的记录，会让未来的自己更容易继续。" : "放入原文摘录。", example ? "A useful record helps your future self pick up where you left off." : "Add the original passage."))}<p class="ln-note-citation">${t(example ? "虚构示例短文，用于演示引用排版" : "页码 / 章节 / 原文链接", example ? "Fictional passage for this formatting example" : "Page / chapter / source link")}</p></blockquote>`,
        ) +
        section(
          t("我的想法", "My thoughts"),
          value(
            t(
              "为什么记住它？可以联系自己的经历，也可以写不同意见。",
              "Why keep it? Connect it to your experience or question it.",
            ),
            p(
              t(
                "以前我常常只保存链接。隔了一段时间，虽然还能找到文章，却忘了当时为什么觉得它有用。",
                "I used to save only the link. Later, I could find the article but had forgotten why it mattered.",
              ),
            ) +
              p(
                t(
                  "现在试着在收藏后补一句用途：<mark>准备在哪件事上用到它？</mark>不需要长篇总结，一两句话也有价值。",
                  "Now I add a purpose: <mark>What might I use this for?</mark> One or two sentences can be enough.",
                ),
              ),
          ),
        ) +
        section(
          t("想试一试", "Something to try"),
          value(
            t(
              "选一个小行动，或留下一个还想追问的问题。",
              "Choose a small action or a question to explore.",
            ),
            tasks([
              [
                false,
                t(
                  "从最近的一条收藏开始，补上一句用途说明",
                  "Add a purpose to one recent bookmark",
                ),
              ],
            ]),
          ),
        ) +
        footer(
          t("相关笔记", "Related notes"),
          t(
            example ? "Markdown 语法速查表" : "添加一篇相关笔记或原文链接",
            example
              ? "Markdown quick reference"
              : "Add a related note or the original source",
          ),
        ),
    );
  if (key === "project")
    return page(
      key,
      head(
        t(
          example ? "把团队资料整理到一个地方" : "项目名称",
          example ? "Bring project references together" : "Project name",
        ),
        t("负责人 · 姓名", "Owner · Name"),
      ) +
        block(
          t("要达成什么", "The goal"),
          value(
            t(
              "希望解决什么问题？做到什么算完成？",
              "What problem will this solve? What does done look like?",
            ),
            p(
              t(
                "让大家能从一个入口找到常用资料。先整理一个项目，确认能用，再逐步扩展。",
                "Make common references easy to find from one place. Start with one project and expand after trying it.",
              ),
            ),
          ),
          "focus",
        ) +
        `<div class="ln-note-scope"><div><h3>${t("这次做", "In scope")}</h3>${p(t(example ? "常用文档、参考链接和会议记录" : "写清范围", example ? "Common documents, links and meeting notes" : "Describe the scope"))}</div><div><h3>${t("暂时不做", "Not yet")}</h3>${p(t(example ? "历史资料全量搬迁、复杂分类" : "写清边界", example ? "Moving all historical files or creating complex categories" : "Describe the boundary"))}</div></div>` +
        block(
          t("推进计划", "Milestones"),
          table(
            t(["阶段", "交付物", "完成时间"], ["Stage", "Deliverable", "Due"]),
            example
              ? t(
                  [
                    ["01 整理", "可浏览的资料清单", "第 1 周"],
                    ["02 试用", "问题与反馈记录", "第 2 周"],
                    ["03 调整", "更新后的项目说明", "第 2 周"],
                  ],
                  [
                    ["01 Organize", "A reference collection", "Week 1"],
                    ["02 Try", "Feedback and issues", "Week 2"],
                    ["03 Adjust", "An updated project brief", "Week 2"],
                  ],
                )
              : t(
                  [
                    ["第一步", "可检查的结果", "日期"],
                    ["第二步", "可检查的结果", "日期"],
                  ],
                  [
                    ["First step", "An observable result", "Date"],
                    ["Second step", "An observable result", "Date"],
                  ],
                ),
          ),
          "open",
        ) +
        columns(
          block(
            t("需要留意", "Watch out for"),
            value(
              t("有哪些依赖或风险？", "Any dependencies or risks?"),
              p(
                t(
                  "旧文件来源不完整，先标记待确认，保留原件。",
                  "Some older files have no source. Mark them for review and keep the originals.",
                ),
              ),
            ),
            "quiet",
          ) +
            block(
              t("现在就做", "Start here"),
              tasks([
                [
                  false,
                  t(
                    example
                      ? "列出当前项目最常用的 10 份资料"
                      : "写下可以立即开始的一步",
                    example
                      ? "List the ten most-used references in the project"
                      : "One action you can start now",
                  ),
                ],
              ]),
              "quiet",
            ),
        ),
    );
  if (key === "review")
    return page(
      key,
      head(
        t(
          example ? "第一次资料整理，我们学到了什么" : "复盘事项",
          example
            ? "What we learned from the first attempt"
            : "Topic to review",
        ),
        date,
      ) +
        `<div class="ln-note-review-facts"><div><h2>${t("原本希望", "What we expected")}</h2>${p(t(example ? "大家能独立找到项目常用资料。" : "最初预期是什么？", example ? "Everyone could find common project references independently." : "What was the initial expectation?"))}</div><div><h2>${t("实际发生", "What happened")}</h2>${p(t(example ? "大部分资料能找到，两份文件的命名仍让人困惑。" : "记录可核对的事实。", example ? "Most references were easy to find, but two file names were confusing." : "Keep verifiable facts."))}</div></div>` +
        block(
          t("原因与发现", "Causes & observations"),
          value(
            t(
              "哪些因素带来了差异？先写能确认的。",
              "What caused the difference? Start with what you can verify.",
            ),
            p(
              t(
                "按项目放在一起解决了入口分散的问题；只用“最终版”命名，仍然看不出文件的用途。",
                "Grouping by project helped. Names such as “final version” still did not explain what the files were for.",
              ),
            ),
          ),
          "open",
        ) +
        columns(
          block(
            t("继续保持", "Keep"),
            value(
              t("有效的做法", "What worked"),
              p(t("统一资料入口", "One place to find references")),
            ),
            "retro ln-note-keep",
          ) +
            block(
              t("减少或停止", "Reduce or stop"),
              value(
                t("投入大、帮助小的做法", "Effort with little value"),
                p(t("反复调整分类", "Repeatedly changing categories")),
              ),
              "retro ln-note-stop",
            ) +
            block(
              t("下次尝试", "Try next"),
              value(
                t("一个值得试的改变", "A change worth trying"),
                p(
                  t("在文件名中写明用途", "Describe the purpose in file names"),
                ),
              ),
              "retro ln-note-try",
            ),
          "retro",
        ) +
        block(
          t("下一步行动", "Next action"),
          tasks([
            [
              false,
              t(
                example
                  ? "下次讨论前更新两份文件的命名，再请同事找一次"
                  : "谁在什么时候，尝试什么改变？",
                example
                  ? "Rename the two files before the next discussion, then ask a colleague to find them"
                  : "Who will try what, and by when?",
              ),
            ],
          ]),
          "next",
        ),
    );
  throw new Error("UNKNOWN_BUILTIN_NOTE_TEMPLATE");
}

function renderMarkdown(key, locale, example) {
  const zh = locale === "zh-CN";
  if (key === "knowledge")
    return zh
      ? `> 记录于 {{date}}

## 一句话理解

${example ? "文件名既是名称，也是找回时的线索。" : "用自己的话解释这个概念。"}

## 关键要点

${example ? "1. 让人看出是什么内容。\n2. 保留需要区分的日期或版本。\n3. 避免只有“最终版”“新建文档”。" : "保留最重要的两三点。"}

## 一个例子

${example ? "\`项目说明_资料整理.md\`" : "举一个能说明问题的例子。"}

## 适用边界

${example ? "临时草稿可以简单命名。需要共享、长期保存或存在多个版本时，再补全信息。" : "什么时候不适用？还有什么没想清楚？"}

## 相关笔记

${example ? "资料整理与会议记录。" : "添加来源或关联笔记。"}
`
      : `> Recorded on {{date}}

## In one sentence

${example ? "A file name is also a clue for finding it later." : "Explain the concept in your own words."}

## Key points

${example ? "1. Make the content recognizable.\n2. Include dates or versions when needed.\n3. Avoid names such as “final” or “new document”." : "Keep the two or three most important points."}

## An example

${example ? "\`project-brief-reference-collection.md\`" : "Add an example that makes the idea clear."}

## Limits

${example ? "Temporary drafts can have simple names. Add more detail when sharing, archiving or keeping multiple versions." : "When does it not apply? What is still unclear?"}

## Related notes

${example ? "Reference collection and meeting notes." : "Add a source or related note."}
`;
  const code = example
    ? zh
      ? "mindmap\n  root(周末出行)\n    去哪里\n      公园\n      展览\n    带什么\n      水\n      相机\n    怎么安排\n      交通\n      时间"
      : "mindmap\n  root(Weekend outing)\n    Where\n      Park\n      Exhibition\n    What to bring\n      Water\n      Camera\n    Planning\n      Transport\n      Time"
    : zh
      ? "mindmap\n  root(中心主题)\n    分支一\n      要点 A\n    分支二\n      要点 B\n    分支三"
      : "mindmap\n  root(Central topic)\n    Branch 1\n      Point A\n    Branch 2\n      Point B\n    Branch 3";
  return `${zh ? "> 整理于" : "> Organized on"} {{date}}

## ${zh ? "主题脑图" : "Topic map"}

\`\`\`mermaid
${code}
\`\`\`

## ${zh ? "补充说明" : "Additional details"}

${zh ? (example ? "优先选择公共交通能到的地方。出发前看天气，再确定室内还是户外。" : "按需要展开分支，不必把图里的文字再抄一遍。") : example ? "Choose somewhere accessible by public transport. Check the weather before deciding on an indoor or outdoor activity." : "Expand the branches as needed, without repeating everything in the map."}

## ${zh ? "下一步" : "Next step"}

${zh ? (example ? "确认展览开放时间，保存地址与交通路线。" : "从图中选一个需要确认的事项。") : example ? "Check opening hours and save the address and route." : "Choose one detail from the map to confirm."}
`;
}

export const BUILTIN_NOTE_BODIES = Object.fromEntries(
  [
    "daily",
    "weekly",
    "meeting",
    "reading",
    "project",
    "review",
    "knowledge",
    "mindmap",
  ].map((key) => {
    const render = ["knowledge", "mindmap"].includes(key)
      ? renderMarkdown
      : renderHtml;
    return [
      key,
      {
        content: Object.fromEntries(
          ["zh-CN", "en-US"].map((locale) => [
            locale,
            render(key, locale, false),
          ]),
        ),
        exampleContent: Object.fromEntries(
          ["zh-CN", "en-US"].map((locale) => [
            locale,
            render(key, locale, true),
          ]),
        ),
      },
    ];
  }),
);

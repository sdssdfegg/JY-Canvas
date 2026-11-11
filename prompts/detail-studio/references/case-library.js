// prompts/detail-studio/references/case-library.js
//
// 优秀 / 失败案例库（阶段 3C P2）：每个行业至少 1 组正例 + 1 组反例，逐条标注「为什么好 / 为什么失败」。
// 对照 3A §3.2 的 SKILL 沉淀标准：好案例体现「决策逻辑驱动、事实不夸大、视觉/文案为商品服务」；
// 坏案例体现「套模板、虚构功效、串用参考图、绝对化用词」。
// 纯数据资产，供 analyze-strategy / director-visual / 质检参考，不单独立 Agent。

export const CASE_LIBRARY = Object.freeze({
  generic: {
    good: [{
      title: "通用小家电：事实驱动的首屏+参数屏",
      scenario: "一款桌面加湿器，用户提供了容量/噪音/续航。",
      snippet: "首屏：产品放桌面真实场景，主文案「放在桌边的安静加湿」；参数屏：容量300ml/噪音≤35dB/续航8h 如实列出。",
      why: "首屏用场景而非口号建立身份；参数屏只列用户已给的真实数字，未编造续航之外的卖点，事实分级清晰。"
    }],
    bad: [{
      title: "通用食品：绝对化+疗效暗示",
      scenario: "普通坚果礼盒，无功效认证。",
      snippet: "主文案「全网最好吃的坚果，吃了永久不上火」，副文案「100% 纯天然治疗级」。",
      why: "命中禁绝对化词（最/100%/永久）与禁医疗化词（治疗/不上火疗效暗示）；虚构未证实功效，违反事实分级纪律。"
    }]
  },
  apparel: {
    good: [{
      title: "连衣裙：版型与面料肌理驱动",
      scenario: "用户给了面料成分与版型描述。",
      snippet: "版型屏：收腰 A 字结构特写；材质屏：面料织纹微距+「看得见的垂坠感」；场景屏：通勤与周末两种穿搭。",
      why: "卖点来自用户确证的版型/面料，而非精修失真；模特姿态服务商品展示，未改变结构；相邻屏构图有变化。"
    }],
    bad: [{
      title: "外套：精修失真+改结构",
      scenario: "用户原图是短款夹克。",
      snippet: "生成图把袖口改成毛毛领、纽扣颜色改金、领口加高，主文案「奢华贵妇同款」。",
      why: "违反 apparel promoBoundaries：改了袖口层次/纽扣颜色/领口形态，且「贵妇同款」暗示未证实的品牌关联。"
    }]
  },
  beauty: {
    good: [{
      title: "精华：质地与成分氛围",
      scenario: "用户给了成分表与瓶身形态。",
      snippet: "首屏：瓶身微距+液体质感；成分屏：列出用户提供的成分名+「看得见的清爽质地」；仪式感屏：早晚护肤步骤。",
      why: "以可见质地与成分氛围建立信任，未承诺医疗疗效；瓶型/标签未改；文案未越界成药品宣传。"
    }],
    bad: [{
      title: "面霜：前后对比夸张+疗效承诺",
      scenario: "普通保湿面霜。",
      snippet: "左图「使用前暗沉」右图「使用后美白」，主文案「7 天根治暗沉、医用级修复」。",
      why: "违反 beauty promoBoundaries：承诺医疗疗效、虚构修复结果、生成前后对比夸张效果；命中禁医疗化词。"
    }]
  },
  food: {
    good: [{
      title: "咖啡：真实食欲与场景",
      scenario: "用户给了产地与烘焙度。",
      snippet: "首屏：杯中咖啡油脂特写+暖光；食材屏：咖啡豆状态如实；场景屏：早晨书桌/下午茶。",
      why: "真实食欲感与口感联想驱动；产地/烘焙度来自用户资料；未夸大健康疗效，食物观感新鲜。"
    }],
    bad: [{
      title: "零食：虚构产地认证+变质观感",
      scenario: "普通薯片。",
      snippet: "主文案「进口有机认证、治疗亚健康」，配图薯片发软出油。",
      why: "虚构产地认证、命中禁医疗化词；画面让食物看起来变质（违反 food taboo）；事实未证实即写成卖点。"
    }]
  },
  electronics: {
    good: [{
      title: "耳机：参数可信与接口细节",
      scenario: "用户给了续航/接口/降噪参数。",
      snippet: "首屏：耳机本体边缘清晰；参数屏：续航30h/Type-C/主动降噪如实；细节屏：按键与接口位置特写。",
      why: "参数来自用户提供、可信；接口/按键真实；未添加不存在的接口，未生成虚假屏幕内容。"
    }],
    bad: [{
      title: "手机壳：虚构参数+竞品 logo",
      scenario: "普通手机壳。",
      snippet: "主文案「航空级材质、防摔 100 米」，画面混入某品牌 logo 水印。",
      why: "虚构未证实参数（防摔100米）；画面混入竞品 logo（违反 electronics promoBoundaries）；命中禁绝对化词。"
    }]
  },
  home: {
    good: [{
      title: "收纳盒：空间适配与尺寸比例",
      scenario: "用户给了尺寸与材质。",
      snippet: "首屏：放在真实书架上的尺度参照；尺寸屏：长/宽/高与容量如实；场景屏：书房/玄关两种用法。",
      why: "真实家居场景+尺度参照建立可信；尺寸比例合理；未夸大承重，未混入无关家具品牌。"
    }],
    bad: [{
      title: "椅子：夸大承重+不合理比例",
      scenario: "普通餐椅。",
      snippet: "主文案「承重 1000 斤永久不坏」，画面椅子比例失调、人坐上去悬浮。",
      why: "虚构承重与安全能力（违反 home promoBoundaries）；生成不合理尺寸比例；命中禁绝对化词（永久）。"
    }]
  },
  cleaning: {
    good: [{
      title: "洗衣液：安全与可验证事实",
      scenario: "用户给了成分与净含量。",
      snippet: "首屏：瓶身清晰+真实使用场景；成分屏：用户提供的表活成分；安全屏：适用材质如实标注。",
      why: "安全/成分优先、可验证事实而非功效夸张；净含量如实；未暗示医疗疗效，未虚构除菌率。"
    }],
    bad: [{
      title: "消毒液：虚构除菌率+医疗暗示",
      scenario: "普通衣物消毒液。",
      snippet: "主文案「99.999% 杀灭所有病毒、医用治疗级」，包装文字乱码。",
      why: "虚构未证实的除菌率（违反 cleaning promoBoundaries）；命中禁医疗化词；包装文字乱码（qc 硬伤）。"
    }]
  }
});

/** 确定性：案例库覆盖的行业清单（供 skill-asset-contract-check.mjs 断言每行业≥1正+1反）。 */
export function caseLibraryCoverage() {
  const out = {};
  for (const [industry, group] of Object.entries(CASE_LIBRARY)) {
    out[industry] = {
      good: Array.isArray(group.good) ? group.good.length : 0,
      bad: Array.isArray(group.bad) ? group.bad.length : 0
    };
  }
  return out;
}

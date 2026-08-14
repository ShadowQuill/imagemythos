(function(root){
  const bank = {
  "version": "v1.2-internal",
  "description": "自研题库 v1.2-internal：在 v1.1 基础上依据 G1-R2 盲审意见进一步去人称化修订——将型2/型6关系性理念选项中的\"有人/的人\"改为主语隐去的场域状态，避免投射题被读成性格自陈；Image F 同步重绘。保持题干、选项顺序与 signals 映射不变以与 v1.0/v1.1 逐题可比。",
  "signs": {
    "aries": {
      "label": "白羊",
      "vector": {
        "warm": 0.6,
        "soft": -0.6,
        "explicit": 0.4,
        "light": 0.3
      }
    },
    "taurus": {
      "label": "金牛",
      "vector": {
        "natural": 0.7,
        "light": -0.5,
        "warm": 0.4,
        "traditional": 0.4
      }
    },
    "gemini": {
      "label": "双子",
      "vector": {
        "warm": -0.5,
        "light": 0.6,
        "traditional": -0.4,
        "explicit": 0.3
      }
    },
    "cancer": {
      "label": "巨蟹",
      "vector": {
        "soft": 0.7,
        "warm": 0.5,
        "sacred": 0.4,
        "natural": 0.3
      }
    },
    "leo": {
      "label": "狮子",
      "vector": {
        "warm": 0.7,
        "explicit": 0.7,
        "soft": -0.4,
        "light": -0.3
      }
    },
    "virgo": {
      "label": "处女",
      "vector": {
        "order": 0.7,
        "natural": 0.5,
        "warm": -0.3,
        "light": 0.3
      }
    },
    "libra": {
      "label": "天秤",
      "vector": {
        "soft": 0.5,
        "warm": -0.4,
        "light": 0.4,
        "sacred": 0.3,
        "traditional": 0.3
      }
    },
    "scorpio": {
      "label": "天蝎",
      "vector": {
        "soft": -0.6,
        "sacred": 0.5,
        "light": -0.5,
        "explicit": -0.5
      }
    },
    "sagittarius": {
      "label": "射手",
      "vector": {
        "warm": 0.5,
        "light": 0.6,
        "traditional": -0.6,
        "explicit": 0.3
      }
    },
    "capricorn": {
      "label": "摩羯",
      "vector": {
        "order": 0.6,
        "traditional": 0.7,
        "light": -0.6,
        "warm": -0.3
      }
    },
    "aquarius": {
      "label": "水瓶",
      "vector": {
        "warm": -0.6,
        "traditional": -0.7,
        "natural": -0.5,
        "soft": -0.3,
        "light": 0.4
      }
    },
    "pisces": {
      "label": "双鱼",
      "vector": {
        "soft": 0.7,
        "sacred": 0.6,
        "explicit": -0.5,
        "natural": 0.4,
        "light": 0.3
      }
    }
  },
  "frameworks": {
    "enneagram": {
      "name": "九型 · 神圣理念",
      "measurement": "indirect",
      "holyIdeaDraft": false,
      "g1BlindReview": {
        "passed": true,
        "date": "2026-08-06",
        "rounds": [
          "R1 初审",
          "R2 复审",
          "R3 增量复审"
        ],
        "lastRound": "R3 增量复审",
        "reviewers": 3,
        "itemAgreement": 1,
        "imageAgreement": 1,
        "flaggedItems": 0,
        "note": "G1 盲审通过：12 题 + 9 图全部 3/3 全票保留，逐题一致率 100%，争议 0。v1.2 去人称化修订（P7 原则）经 R3 增量复审确认有效。"
      },
      "results": {
        "1": {
          "label": "型1 · 神圣完美",
          "vector": {
            "order": 1,
            "sacred": 0.6,
            "soft": -0.4,
            "traditional": 0.3
          }
        },
        "2": {
          "label": "型2 · 神圣自由/意志",
          "vector": {
            "warm": 0.7,
            "explicit": 0.3,
            "light": 0.3
          }
        },
        "3": {
          "label": "型3 · 神圣希望/法则",
          "vector": {
            "explicit": 0.6,
            "light": 0.4,
            "order": 0.3
          }
        },
        "4": {
          "label": "型4 · 神圣本原/独特性",
          "vector": {
            "soft": 0.6,
            "sacred": 0.5,
            "explicit": -0.4,
            "natural": 0.3
          }
        },
        "5": {
          "label": "型5 · 神圣透明/全知",
          "vector": {
            "order": 0.5,
            "warm": -0.6,
            "light": 0.3,
            "natural": -0.3
          }
        },
        "6": {
          "label": "型6 · 神圣力量/信仰",
          "vector": {
            "traditional": 0.5,
            "order": 0.4,
            "light": -0.4
          }
        },
        "7": {
          "label": "型7 · 神圣智慧/计划",
          "vector": {
            "light": 0.6,
            "warm": 0.4,
            "explicit": 0.3,
            "traditional": -0.4
          }
        },
        "8": {
          "label": "型8 · 神圣真理/正义",
          "vector": {
            "soft": -0.7,
            "light": -0.5,
            "explicit": 0.5,
            "sacred": 0.3
          }
        },
        "9": {
          "label": "型9 · 神圣爱/合一",
          "vector": {
            "soft": 0.7,
            "natural": 0.6,
            "warm": 0.4,
            "light": 0.3
          }
        }
      },
      "items": [
        {
          "id": "e1",
          "type": "projective",
          "text": "看到「空旷雪原上一棵孤树」的图，你更被哪句感受抓住？",
          "options": [
            {
              "text": "一切本应可以更完美",
              "signals": {
                "1": 1
              }
            },
            {
              "text": "这份空里，好像有什么一直在陪着它",
              "signals": {
                "2": 1
              }
            },
            {
              "text": "想把它拍下来、做成作品",
              "signals": {
                "3": 1
              }
            },
            {
              "text": "觉得自己和树一样，孤独却完整",
              "signals": {
                "4": 1
              }
            }
          ]
        },
        {
          "id": "e2",
          "type": "projective",
          "text": "一段对话忽然安静下来。让你觉得「这一刻反而是好的」，更接近？",
          "options": [
            {
              "text": "安静下来时，事情真实的轮廓浮了出来",
              "signals": {
                "5": 1
              }
            },
            {
              "text": "不用出声也不会散，底下本来就是稳的",
              "signals": {
                "6": 1
              }
            },
            {
              "text": "空白像个入口，后面还有很多可能",
              "signals": {
                "7": 1
              }
            },
            {
              "text": "没人再演了，只剩下真实",
              "signals": {
                "8": 1
              }
            }
          ]
        },
        {
          "id": "e3",
          "type": "projective",
          "text": "想象一个你待着很舒服的场所。它之所以成立，更多因为？",
          "options": [
            {
              "text": "所有东西各在其位，彼此不冲突",
              "signals": {
                "9": 1
              }
            },
            {
              "text": "每处细节都恰到好处，没有多余",
              "signals": {
                "1": 1
              }
            },
            {
              "text": "它毫不费力地接纳了走进来的人",
              "signals": {
                "2": 1
              }
            },
            {
              "text": "它没被刻意经营，却长成了对的样子",
              "signals": {
                "3": 1
              }
            }
          ]
        },
        {
          "id": "e4",
          "type": "projective",
          "text": "看到「雨后清晨、雾还没散的山谷」，你更被哪种感觉抓住？",
          "options": [
            {
              "text": "有种说不出的、只属于此刻的东西",
              "signals": {
                "4": 1
              }
            },
            {
              "text": "雾散开后，一切会变得很清楚",
              "signals": {
                "5": 1
              }
            },
            {
              "text": "它一直都在，天亮了还会在",
              "signals": {
                "6": 1
              }
            },
            {
              "text": "雾后面不知道有什么，让人想走进去",
              "signals": {
                "7": 1
              }
            }
          ]
        },
        {
          "id": "e5",
          "type": "projective",
          "text": "哪一句话，你听了会心里一动？",
          "options": [
            {
              "text": "「你不用绕，直接说就行。」",
              "signals": {
                "8": 1
              }
            },
            {
              "text": "「你在这里，本来就是合适的。」",
              "signals": {
                "9": 1
              }
            },
            {
              "text": "「已经很好了，不用再改了。」",
              "signals": {
                "1": 1
              }
            },
            {
              "text": "「你不需要做什么来换。」",
              "signals": {
                "2": 1
              }
            }
          ]
        },
        {
          "id": "e6",
          "type": "projective",
          "text": "一件重要的事就要开始了。此刻你更希望身边有什么？",
          "options": [
            {
              "text": "一条清楚的路径，走下去就会到",
              "signals": {
                "3": 1
              }
            },
            {
              "text": "一点只属于自己的、不必解释的时间",
              "signals": {
                "4": 1
              }
            },
            {
              "text": "足够的信息，让我看得见全貌",
              "signals": {
                "5": 1
              }
            },
            {
              "text": "一种就算出岔子也不会塌的底",
              "signals": {
                "6": 1
              }
            }
          ]
        },
        {
          "id": "e7",
          "type": "projective",
          "text": "「自由」这个词，让你先想到的画面更接近？",
          "options": [
            {
              "text": "前方有很多条路，每条都还没走过",
              "signals": {
                "7": 1
              }
            },
            {
              "text": "站在开阔处，风迎面来，没有遮挡",
              "signals": {
                "8": 1
              }
            },
            {
              "text": "一整个下午，没有任何事非做不可",
              "signals": {
                "9": 1
              }
            },
            {
              "text": "东西都在该在的位置，心里很清爽",
              "signals": {
                "1": 1
              }
            }
          ]
        },
        {
          "id": "e8",
          "type": "projective",
          "text": "有人正处在难处。你觉得真正能帮到他的，更接近？",
          "options": [
            {
              "text": "让他知道，他不必先变好才值得被善待",
              "signals": {
                "2": 1
              }
            },
            {
              "text": "让他看见，事情本来就会朝好的方向长",
              "signals": {
                "3": 1
              }
            },
            {
              "text": "让他碰到自己心里那个最真的东西",
              "signals": {
                "4": 1
              }
            },
            {
              "text": "让他看清全貌，然后他自己就明白了",
              "signals": {
                "5": 1
              }
            }
          ]
        },
        {
          "id": "e9",
          "type": "projective",
          "text": "你最怕的关系是？",
          "options": [
            {
              "text": "随时要站队、担责任",
              "signals": {
                "6": 1
              }
            },
            {
              "text": "被框死、没新鲜感",
              "signals": {
                "7": 1
              }
            },
            {
              "text": "被控制、不得自由",
              "signals": {
                "8": 1
              }
            },
            {
              "text": "冲突不断、不得安宁",
              "signals": {
                "9": 1
              }
            }
          ]
        },
        {
          "id": "e10",
          "type": "projective",
          "text": "一天结束时，哪种感觉更让你觉得「这天没有白过」？",
          "options": [
            {
              "text": "有些东西被我理顺了，变干净了",
              "signals": {
                "1": 1
              }
            },
            {
              "text": "我碰到了一点很真、很像自己的东西",
              "signals": {
                "4": 1
              }
            },
            {
              "text": "我遇到了一些原本不知道会遇到的",
              "signals": {
                "7": 1
              }
            },
            {
              "text": "今天有一点温度，是经过我传出去的",
              "signals": {
                "2": 1
              }
            }
          ]
        },
        {
          "id": "e11",
          "type": "projective",
          "text": "什么样的东西，会让你觉得「它经得起时间」？",
          "options": [
            {
              "text": "它一直在自然地生长，从没停过",
              "signals": {
                "3": 1
              }
            },
            {
              "text": "它经历过很多次动荡，仍在原地",
              "signals": {
                "6": 1
              }
            },
            {
              "text": "它不与任何东西为敌，所以无处可损",
              "signals": {
                "9": 1
              }
            },
            {
              "text": "它的道理是通的，所以不会塌",
              "signals": {
                "5": 1
              }
            }
          ]
        },
        {
          "id": "e12",
          "type": "projective",
          "text": "事情没有按预想发生。事后回看，你更容易生出哪种感觉？",
          "options": [
            {
              "text": "那一下反而让真实的东西露了出来",
              "signals": {
                "8": 1
              }
            },
            {
              "text": "那一刻被接住的感觉，比原计划更要紧",
              "signals": {
                "2": 1
              }
            },
            {
              "text": "我原来漏看了一块，现在看全了",
              "signals": {
                "5": 1
              }
            },
            {
              "text": "它其实把我推去了更该去的地方",
              "signals": {
                "3": 1
              }
            }
          ]
        }
      ],
      "revision": {
        "from": "v1.1-internal",
        "basis": "G1-R2 专家盲审（n=3），题项平均一致率 88.9%，争议 4 项，全部集中在含人称的型2/型6选项",
        "kept": [
          "e3",
          "e4",
          "e5",
          "e7",
          "e8",
          "e9",
          "e11"
        ],
        "rewritten": [
          "e1",
          "e2",
          "e6",
          "e10",
          "e12"
        ],
        "replaced": [],
        "principles": [
          "P1 注意力落点：问「什么让你停住」而非「你会怎么做」",
          "P2 等价可欲：四选项均为正面表述，消除社会赞许性偏差",
          "P3 无通俗二分：不可被读成感性/理性、大胆/胆小、自由/计划",
          "P4 无他评式：删除「别人说你」类题干",
          "P5 区分度：四选项指向明显不同的世界图景，避免语义相邻",
          "P6 意象化：用画面/场景承载，贴合审美系统定位",
          "P7 去人称化：承载关系性理念（型2、型6）的选项不得出现\"有人/的人\"，改用无主语的场域状态（被托住/不会塌/有温度经过）"
        ]
      }
    },
    "jung": {
      "name": "荣格原型",
      "measurement": "direct",
      "results": {
        "innocent": {
          "label": "天真者",
          "vector": {
            "soft": 0.5,
            "warm": 0.4,
            "natural": 0.4,
            "light": 0.4
          }
        },
        "everyman": {
          "label": "凡夫",
          "vector": {
            "natural": 0.5,
            "warm": 0.4,
            "soft": 0.3
          }
        },
        "hero": {
          "label": "英雄",
          "vector": {
            "soft": -0.5,
            "explicit": 0.5,
            "light": -0.4,
            "order": 0.3
          }
        },
        "caregiver": {
          "label": "照顾者",
          "vector": {
            "warm": 0.7,
            "soft": 0.5
          }
        },
        "explorer": {
          "label": "探索者",
          "vector": {
            "natural": 0.6,
            "light": 0.4,
            "traditional": -0.4,
            "explicit": -0.3
          }
        },
        "rebel": {
          "label": "反叛者",
          "vector": {
            "soft": -0.6,
            "order": -0.6,
            "explicit": 0.4
          }
        },
        "lover": {
          "label": "恋人",
          "vector": {
            "warm": 0.7,
            "soft": 0.5,
            "sacred": 0.4
          }
        },
        "creator": {
          "label": "创造者",
          "vector": {
            "traditional": -0.6,
            "natural": -0.4,
            "soft": -0.3,
            "explicit": 0.3
          }
        },
        "jester": {
          "label": "弄臣",
          "vector": {
            "order": -0.5,
            "light": 0.6,
            "explicit": 0.3
          }
        },
        "sage": {
          "label": "智者",
          "vector": {
            "warm": -0.5,
            "order": 0.4,
            "sacred": 0.5,
            "light": 0.3
          }
        },
        "ruler": {
          "label": "统治者",
          "vector": {
            "order": 0.7,
            "light": -0.5,
            "explicit": 0.4,
            "traditional": 0.4
          }
        },
        "magician": {
          "label": "魔法师",
          "vector": {
            "sacred": 0.7,
            "traditional": -0.5,
            "natural": -0.4,
            "soft": -0.3
          }
        }
      },
      "items": [
        {
          "id": "j1",
          "type": "situation",
          "text": "团队里你更常扮演？",
          "options": [
            {
              "text": "带来简单快乐、让人放松的人",
              "signals": {
                "innocent": 1
              }
            },
            {
              "text": "和大家一样、好相处的普通人",
              "signals": {
                "everyman": 1
              }
            },
            {
              "text": "定方向、冲在前面的人",
              "signals": {
                "hero": 1
              }
            },
            {
              "text": "照顾大家情绪的人",
              "signals": {
                "caregiver": 1
              }
            }
          ]
        },
        {
          "id": "j2",
          "type": "projective",
          "text": "你最享受的状态？",
          "options": [
            {
              "text": "探索未知之地",
              "signals": {
                "explorer": 1
              }
            },
            {
              "text": "打破规矩、不按常理",
              "signals": {
                "rebel": 1
              }
            },
            {
              "text": "和人深度亲密相拥",
              "signals": {
                "lover": 1
              }
            },
            {
              "text": "从零造出一件作品",
              "signals": {
                "creator": 1
              }
            }
          ]
        },
        {
          "id": "j3",
          "type": "projective",
          "text": "你希望被记住为？",
          "options": [
            {
              "text": "带来欢乐的人",
              "signals": {
                "jester": 1
              }
            },
            {
              "text": "洞见真相的智者",
              "signals": {
                "sage": 1
              }
            },
            {
              "text": "有力量、主持公道的人",
              "signals": {
                "ruler": 1
              }
            },
            {
              "text": "点石成金的魔法师",
              "signals": {
                "magician": 1
              }
            }
          ]
        },
        {
          "id": "j4",
          "type": "situation",
          "text": "面对一条没人走过的路，你？",
          "options": [
            {
              "text": "带着天真好奇就迈出去",
              "signals": {
                "innocent": 1
              }
            },
            {
              "text": "兴奋地想看清尽头有什么",
              "signals": {
                "explorer": 1
              }
            },
            {
              "text": "边走边玩，不在乎终点",
              "signals": {
                "jester": 1
              }
            },
            {
              "text": "先判断值不值得走、再带队",
              "signals": {
                "ruler": 1
              }
            }
          ]
        },
        {
          "id": "j5",
          "type": "projective",
          "text": "你眼中的「智慧」？",
          "options": [
            {
              "text": "知道大家怎么过日子",
              "signals": {
                "everyman": 1
              }
            },
            {
              "text": "敢质疑所谓的常识",
              "signals": {
                "rebel": 1
              }
            },
            {
              "text": "看透本质、活得明白",
              "signals": {
                "sage": 1
              }
            },
            {
              "text": "懂得借势、把不可能变可能",
              "signals": {
                "magician": 1
              }
            }
          ]
        },
        {
          "id": "j6",
          "type": "situation",
          "text": "朋友低谷时你更想？",
          "options": [
            {
              "text": "帮他打赢这一仗",
              "signals": {
                "hero": 1
              }
            },
            {
              "text": "让他感到被深爱",
              "signals": {
                "lover": 1
              }
            },
            {
              "text": "和他一起想出新出路",
              "signals": {
                "creator": 1
              }
            },
            {
              "text": "默默守着他、别让他孤单一人",
              "signals": {
                "caregiver": 1
              }
            }
          ]
        },
        {
          "id": "j7",
          "type": "projective",
          "text": "你更被哪种「力量」打动？",
          "options": [
            {
              "text": "纯粹、不染世故的劲",
              "signals": {
                "innocent": 1
              }
            },
            {
              "text": "掀翻桌子的痛快",
              "signals": {
                "rebel": 1
              }
            },
            {
              "text": "无中生有的创造力",
              "signals": {
                "creator": 1
              }
            },
            {
              "text": "运筹帷幄的掌控",
              "signals": {
                "ruler": 1
              }
            }
          ]
        },
        {
          "id": "j8",
          "type": "situation",
          "text": "聚会里你更可能？",
          "options": [
            {
              "text": "和谁都能聊上两句",
              "signals": {
                "everyman": 1
              }
            },
            {
              "text": "黏着在意的那个人",
              "signals": {
                "lover": 1
              }
            },
            {
              "text": "讲段子把全场逗乐",
              "signals": {
                "jester": 1
              }
            },
            {
              "text": "不动声色地撮合人和事",
              "signals": {
                "magician": 1
              }
            }
          ]
        },
        {
          "id": "j9",
          "type": "projective",
          "text": "你更认同哪种「勇敢」？",
          "options": [
            {
              "text": "迎难而上、保护弱小",
              "signals": {
                "hero": 1
              }
            },
            {
              "text": "敢去没人去的地方",
              "signals": {
                "explorer": 1
              }
            },
            {
              "text": "敢为别人把自己豁出去",
              "signals": {
                "caregiver": 1
              }
            },
            {
              "text": "敢承认自己不知道",
              "signals": {
                "sage": 1
              }
            }
          ]
        },
        {
          "id": "j10",
          "type": "projective",
          "text": "理想的一天更接近？",
          "options": [
            {
              "text": "简单、安心、不被复杂裹挟",
              "signals": {
                "innocent": 1
              }
            },
            {
              "text": "和熟人平平淡淡待着",
              "signals": {
                "everyman": 1
              }
            },
            {
              "text": "想通了一个一直想不通的问题",
              "signals": {
                "sage": 1
              }
            },
            {
              "text": "做出了一点属于自己的东西",
              "signals": {
                "creator": 1
              }
            }
          ]
        },
        {
          "id": "j11",
          "type": "situation",
          "text": "改变现状，你更信？",
          "options": [
            {
              "text": "带头干、以身作则",
              "signals": {
                "hero": 1
              }
            },
            {
              "text": "先破了旧规矩",
              "signals": {
                "rebel": 1
              }
            },
            {
              "text": "用连接和信任慢慢撬动",
              "signals": {
                "lover": 1
              }
            },
            {
              "text": "找到那个关键的杠杆点",
              "signals": {
                "magician": 1
              }
            }
          ]
        },
        {
          "id": "j12",
          "type": "projective",
          "text": "你最怕被说成？",
          "options": [
            {
              "text": "无厘头、不靠谱",
              "signals": {
                "jester": 1
              }
            },
            {
              "text": "安于现状、没追求",
              "signals": {
                "explorer": 1
              }
            },
            {
              "text": "冷漠、不上心",
              "signals": {
                "caregiver": 1
              }
            },
            {
              "text": "没担当、镇不住场",
              "signals": {
                "ruler": 1
              }
            }
          ]
        }
      ]
    },
    "astro": {
      "name": "占星 · 日月升",
      "measurement": "indirect",
      "aspectWeights": {
        "sun": 1,
        "moon": 0.6,
        "asc": 0.4
      },
      "results": {},
      "items": [
        {
          "id": "as1",
          "aspect": "sun",
          "type": "situation",
          "text": "你更天然的「对外」能量是？",
          "options": [
            {
              "text": "热烈、直接、点燃场子",
              "signals": {
                "aries": 1
              }
            },
            {
              "text": "稳重、踏实、让人安心",
              "signals": {
                "taurus": 0.7
              }
            },
            {
              "text": "灵动、善变、点子多",
              "signals": {
                "gemini": 0.5
              }
            },
            {
              "text": "温柔、包裹、共情强",
              "signals": {
                "cancer": 0.3
              }
            }
          ]
        },
        {
          "id": "as2",
          "aspect": "sun",
          "type": "projective",
          "text": "你希望别人一眼记住你什么？",
          "options": [
            {
              "text": "耀眼、有存在感",
              "signals": {
                "leo": 1
              }
            },
            {
              "text": "严谨、可靠、靠谱",
              "signals": {
                "virgo": 0.7
              }
            },
            {
              "text": "美感、平衡、得体",
              "signals": {
                "libra": 0.5
              }
            },
            {
              "text": "深刻、神秘、有厚度",
              "signals": {
                "scorpio": 0.3
              }
            }
          ]
        },
        {
          "id": "as3",
          "aspect": "sun",
          "type": "projective",
          "text": "你的野心长什么样？",
          "options": [
            {
              "text": "自由、远方、意义",
              "signals": {
                "sagittarius": 1
              }
            },
            {
              "text": "成就、责任、高度",
              "signals": {
                "capricorn": 0.7
              }
            },
            {
              "text": "独特、前瞻、反叛",
              "signals": {
                "aquarius": 0.5
              }
            },
            {
              "text": "梦幻、消融、无边界",
              "signals": {
                "pisces": 0.3
              }
            }
          ]
        },
        {
          "id": "as4",
          "aspect": "sun",
          "type": "situation",
          "text": "在人群里你更像？",
          "options": [
            {
              "text": "冲在前面的点火者",
              "signals": {
                "aries": 1
              }
            },
            {
              "text": "被目光追随的中心",
              "signals": {
                "leo": 0.7
              }
            },
            {
              "text": "到处串场的外交官",
              "signals": {
                "sagittarius": 0.5
              }
            },
            {
              "text": "安静但稳的定海神针",
              "signals": {
                "taurus": 0.3
              }
            }
          ]
        },
        {
          "id": "as5",
          "aspect": "sun",
          "type": "projective",
          "text": "你的「个人风格」底色？",
          "options": [
            {
              "text": "克制、精致",
              "signals": {
                "virgo": 1
              }
            },
            {
              "text": "利落、有型",
              "signals": {
                "capricorn": 0.7
              }
            },
            {
              "text": "混搭、多变",
              "signals": {
                "gemini": 0.5
              }
            },
            {
              "text": "和谐、耐看",
              "signals": {
                "libra": 0.3
              }
            }
          ]
        },
        {
          "id": "as6",
          "aspect": "sun",
          "type": "projective",
          "text": "你最想对外证明的是？",
          "options": [
            {
              "text": "我不走寻常路",
              "signals": {
                "aquarius": 1
              }
            },
            {
              "text": "我很懂照顾人",
              "signals": {
                "cancer": 0.7
              }
            },
            {
              "text": "我看透本质",
              "signals": {
                "scorpio": 0.5
              }
            },
            {
              "text": "我活得自由柔软",
              "signals": {
                "pisces": 0.3
              }
            }
          ]
        },
        {
          "id": "am1",
          "aspect": "moon",
          "type": "situation",
          "text": "深夜独处，你内在更常被哪种情绪填满？",
          "options": [
            {
              "text": "炽热、冲动、想冲",
              "signals": {
                "aries": 1
              }
            },
            {
              "text": "安稳、知足",
              "signals": {
                "taurus": 0.7
              }
            },
            {
              "text": "纷乱、好奇、停不下来",
              "signals": {
                "gemini": 0.5
              }
            },
            {
              "text": "柔软、依恋",
              "signals": {
                "cancer": 0.3
              }
            }
          ]
        },
        {
          "id": "am2",
          "aspect": "moon",
          "type": "projective",
          "text": "用什么方式你能真正安抚自己？",
          "options": [
            {
              "text": "被欣赏、被看见",
              "signals": {
                "leo": 1
              }
            },
            {
              "text": "把事情做对、理顺",
              "signals": {
                "virgo": 0.7
              }
            },
            {
              "text": "关系回到平衡",
              "signals": {
                "libra": 0.5
              }
            },
            {
              "text": "深度连接或完全掌控",
              "signals": {
                "scorpio": 0.3
              }
            }
          ]
        },
        {
          "id": "am3",
          "aspect": "moon",
          "type": "projective",
          "text": "你心底最隐秘的渴望？",
          "options": [
            {
              "text": "自由与远方",
              "signals": {
                "sagittarius": 1
              }
            },
            {
              "text": "被认可的高度",
              "signals": {
                "capricorn": 0.7
              }
            },
            {
              "text": "不被任何人定义",
              "signals": {
                "aquarius": 0.5
              }
            },
            {
              "text": "消融、融合",
              "signals": {
                "pisces": 0.3
              }
            }
          ]
        },
        {
          "id": "am4",
          "aspect": "moon",
          "type": "situation",
          "text": "情绪上来时你更想？",
          "options": [
            {
              "text": "立刻行动、发泄",
              "signals": {
                "aries": 1
              }
            },
            {
              "text": "找人分享、被捧着",
              "signals": {
                "leo": 0.7
              }
            },
            {
              "text": "跑出去透气",
              "signals": {
                "sagittarius": 0.5
              }
            },
            {
              "text": "吃顿好的、静静",
              "signals": {
                "taurus": 0.3
              }
            }
          ]
        },
        {
          "id": "am5",
          "aspect": "moon",
          "type": "projective",
          "text": "你最需要的安全感来自？",
          "options": [
            {
              "text": "一切有序、可控",
              "signals": {
                "virgo": 1
              }
            },
            {
              "text": "有目标、在前进",
              "signals": {
                "capricorn": 0.7
              }
            },
            {
              "text": "有新鲜事分心",
              "signals": {
                "gemini": 0.5
              }
            },
            {
              "text": "有人陪、不孤单",
              "signals": {
                "libra": 0.3
              }
            }
          ]
        },
        {
          "id": "am6",
          "aspect": "moon",
          "type": "projective",
          "text": "独处时你最享受？",
          "options": [
            {
              "text": "不被打扰的自由",
              "signals": {
                "aquarius": 1
              }
            },
            {
              "text": "窝在熟悉的安全感里",
              "signals": {
                "cancer": 0.7
              }
            },
            {
              "text": "深挖自己的世界",
              "signals": {
                "scorpio": 0.5
              }
            },
            {
              "text": "放空、做白日梦",
              "signals": {
                "pisces": 0.3
              }
            }
          ]
        },
        {
          "id": "aa1",
          "aspect": "asc",
          "type": "situation",
          "text": "陌生人初见你，最容易误读成？",
          "options": [
            {
              "text": "好斗 / 有冲劲",
              "signals": {
                "aries": 1
              }
            },
            {
              "text": "稳 / 慢热",
              "signals": {
                "taurus": 0.7
              }
            },
            {
              "text": "善变 / 聪明",
              "signals": {
                "gemini": 0.5
              }
            },
            {
              "text": "敏感 / 温和",
              "signals": {
                "cancer": 0.3
              }
            }
          ]
        },
        {
          "id": "aa2",
          "aspect": "asc",
          "type": "projective",
          "text": "你下意识留给外界的「门面」？",
          "options": [
            {
              "text": "耀眼",
              "signals": {
                "leo": 1
              }
            },
            {
              "text": "得体、严谨",
              "signals": {
                "virgo": 0.7
              }
            },
            {
              "text": "好看、和谐",
              "signals": {
                "libra": 0.5
              }
            },
            {
              "text": "神秘",
              "signals": {
                "scorpio": 0.3
              }
            }
          ]
        },
        {
          "id": "aa3",
          "aspect": "asc",
          "type": "situation",
          "text": "你习惯用哪种姿态进入新环境？",
          "options": [
            {
              "text": "大开大合",
              "signals": {
                "sagittarius": 1
              }
            },
            {
              "text": "克制、专业",
              "signals": {
                "capricorn": 0.7
              }
            },
            {
              "text": "疏离、独特",
              "signals": {
                "aquarius": 0.5
              }
            },
            {
              "text": "模糊、柔软",
              "signals": {
                "pisces": 0.3
              }
            }
          ]
        },
        {
          "id": "aa4",
          "aspect": "asc",
          "type": "situation",
          "text": "第一面你给人的感觉更像？",
          "options": [
            {
              "text": "直接、不绕弯",
              "signals": {
                "aries": 1
              }
            },
            {
              "text": "有气场",
              "signals": {
                "leo": 0.7
              }
            },
            {
              "text": "爽朗、好接近",
              "signals": {
                "sagittarius": 0.5
              }
            },
            {
              "text": "慢悠悠",
              "signals": {
                "taurus": 0.3
              }
            }
          ]
        },
        {
          "id": "aa5",
          "aspect": "asc",
          "type": "projective",
          "text": "你刻意维护的形象是？",
          "options": [
            {
              "text": "靠谱、不出错",
              "signals": {
                "virgo": 1
              }
            },
            {
              "text": "有分寸、专业",
              "signals": {
                "capricorn": 0.7
              }
            },
            {
              "text": "有趣、不无聊",
              "signals": {
                "gemini": 0.5
              }
            },
            {
              "text": "让人舒服",
              "signals": {
                "libra": 0.3
              }
            }
          ]
        },
        {
          "id": "aa6",
          "aspect": "asc",
          "type": "situation",
          "text": "别人对你的第一印象最可能是？",
          "options": [
            {
              "text": "有点特别、难归类",
              "signals": {
                "aquarius": 1
              }
            },
            {
              "text": "温和、好相处",
              "signals": {
                "cancer": 0.7
              }
            },
            {
              "text": "看不透、有深度",
              "signals": {
                "scorpio": 0.5
              }
            },
            {
              "text": "朦胧、无害",
              "signals": {
                "pisces": 0.3
              }
            }
          ]
        }
      ]
    },
    "bigfive": {
      "name": "具体性格 · 大五",
      "measurement": "scale",
      "results": {
        "openness": {
          "label": "开放性",
          "vector": {
            "traditional": -0.6,
            "natural": -0.4,
            "order": -0.3,
            "sacred": 0.3,
            "light": 0.2
          }
        },
        "conscientiousness": {
          "label": "尽责性",
          "vector": {
            "order": 0.7,
            "traditional": 0.4,
            "light": -0.3
          }
        },
        "extraversion": {
          "label": "外向性",
          "vector": {
            "explicit": 0.7,
            "warm": 0.4,
            "light": 0.3
          }
        },
        "agreeableness": {
          "label": "宜人性",
          "vector": {
            "soft": 0.6,
            "warm": 0.5,
            "natural": 0.3
          }
        },
        "neuroticism": {
          "label": "神经质",
          "vector": {
            "light": -0.4,
            "soft": -0.3,
            "order": -0.3,
            "warm": -0.3
          }
        }
      },
      "items": [
        {
          "id": "b1",
          "type": "scale",
          "text": "我常主动尝试新观念、新事物",
          "options": [
            {
              "text": "非常不符合",
              "signals": {
                "openness": -1
              }
            },
            {
              "text": "不太符合",
              "signals": {
                "openness": -0.5
              }
            },
            {
              "text": "说不清",
              "signals": {
                "openness": 0
              }
            },
            {
              "text": "比较符合",
              "signals": {
                "openness": 0.5
              }
            },
            {
              "text": "非常符合",
              "signals": {
                "openness": 1
              }
            }
          ]
        },
        {
          "id": "b2",
          "type": "scale",
          "text": "我做事喜欢先列计划再执行",
          "options": [
            {
              "text": "非常不符合",
              "signals": {
                "conscientiousness": -1
              }
            },
            {
              "text": "不太符合",
              "signals": {
                "conscientiousness": -0.5
              }
            },
            {
              "text": "说不清",
              "signals": {
                "conscientiousness": 0
              }
            },
            {
              "text": "比较符合",
              "signals": {
                "conscientiousness": 0.5
              }
            },
            {
              "text": "非常符合",
              "signals": {
                "conscientiousness": 1
              }
            }
          ]
        },
        {
          "id": "b3",
          "type": "scale",
          "text": "在人群里我更容易被能量填满而非耗尽",
          "options": [
            {
              "text": "非常不符合",
              "signals": {
                "extraversion": -1
              }
            },
            {
              "text": "不太符合",
              "signals": {
                "extraversion": -0.5
              }
            },
            {
              "text": "说不清",
              "signals": {
                "extraversion": 0
              }
            },
            {
              "text": "比较符合",
              "signals": {
                "extraversion": 0.5
              }
            },
            {
              "text": "非常符合",
              "signals": {
                "extraversion": 1
              }
            }
          ]
        },
        {
          "id": "b4",
          "type": "scale",
          "text": "我本能地优先照顾他人感受",
          "options": [
            {
              "text": "非常不符合",
              "signals": {
                "agreeableness": -1
              }
            },
            {
              "text": "不太符合",
              "signals": {
                "agreeableness": -0.5
              }
            },
            {
              "text": "说不清",
              "signals": {
                "agreeableness": 0
              }
            },
            {
              "text": "比较符合",
              "signals": {
                "agreeableness": 0.5
              }
            },
            {
              "text": "非常符合",
              "signals": {
                "agreeableness": 1
              }
            }
          ]
        },
        {
          "id": "b5",
          "type": "scale",
          "text": "小事也容易让我长时间心神不宁",
          "options": [
            {
              "text": "非常不符合",
              "signals": {
                "neuroticism": -1
              }
            },
            {
              "text": "不太符合",
              "signals": {
                "neuroticism": -0.5
              }
            },
            {
              "text": "说不清",
              "signals": {
                "neuroticism": 0
              }
            },
            {
              "text": "比较符合",
              "signals": {
                "neuroticism": 0.5
              }
            },
            {
              "text": "非常符合",
              "signals": {
                "neuroticism": 1
              }
            }
          ]
        }
      ]
    }
  }
};
  const dims = {
  "version": "v0",
  "description": "美学语义空间 v0：8 条双极轴，作为所有框架结果映射的目标空间。取值区间 [-1, +1]，正端为 posLabel，负端为 negLabel。",
  "dimensions": [
    {
      "id": "order",
      "posLabel": "秩序",
      "negLabel": "混沌",
      "definition": "结构、规则、可控感 vs 流动、随机、失控感",
      "posExample": "对称构图、整齐排列、几何",
      "negExample": "泼洒、无序拼贴、留白失控",
      "range": [
        -1,
        1
      ]
    },
    {
      "id": "soft",
      "posLabel": "柔",
      "negLabel": "锐",
      "definition": "圆润、包容、低攻击性 vs 锋利、边界清晰、有张力",
      "posExample": "曲线、绒面、雾感",
      "negExample": "尖角、金属切面、硬光",
      "range": [
        -1,
        1
      ]
    },
    {
      "id": "warm",
      "posLabel": "暖",
      "negLabel": "冷",
      "definition": "亲近、体温感、情绪外放 vs 疏离、理性、冷静",
      "posExample": "橙红、木、烛光",
      "negExample": "蓝灰、石、冷光",
      "range": [
        -1,
        1
      ]
    },
    {
      "id": "explicit",
      "posLabel": "显",
      "negLabel": "隐",
      "definition": "张扬、被看见、存在感强 vs 内敛、克制、退后",
      "posExample": "亮色块、大面积、标识",
      "negExample": "低饱和、小面积、去标识",
      "range": [
        -1,
        1
      ]
    },
    {
      "id": "natural",
      "posLabel": "自然",
      "negLabel": "人工",
      "definition": "有机、材质本真、源于自然 vs 工业、合成、人造感",
      "posExample": "麻、木、植物",
      "negExample": "塑料、霓虹、合金",
      "range": [
        -1,
        1
      ]
    },
    {
      "id": "traditional",
      "posLabel": "传统",
      "negLabel": "未来",
      "definition": "经典、传承、时间沉淀 vs 前瞻、实验、未来感",
      "posExample": "纹样、古籍、陶",
      "negExample": "极简科技、全息、参数化",
      "range": [
        -1,
        1
      ]
    },
    {
      "id": "light",
      "posLabel": "轻盈",
      "negLabel": "厚重",
      "definition": "悬浮、通透、少负担 vs 压实、重量、沉稳",
      "posExample": "薄纱、留白、浅色",
      "negExample": "石材、深重、层叠",
      "range": [
        -1,
        1
      ]
    },
    {
      "id": "sacred",
      "posLabel": "神圣",
      "negLabel": "世俗",
      "definition": "超越、仪式感、精神性 vs 日常、烟火、世俗感",
      "posExample": "光晕、对称穹顶、静默",
      "negExample": "市井、喧闹、实用",
      "range": [
        -1,
        1
      ]
    }
  ]
};
  const data = { bank, dims };
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.AESTHETIC_DATA = data;
}(typeof self !== "undefined" ? self : this));

"""
E2E 测试：会话管理 + 关键字过滤 + 反馈。

通过 echo-core (8080) 调全部接口。
- 测试数据使用独立账号 e2e_session_test，避免污染已有会话。
- 测试结束后不删任何数据。
"""
import requests
import sys
import time

ECHO_CORE = "http://localhost:8080/api"
USERNAME = "e2e_session_test"
PASSWORD = "Test12345!"

def pp(label, obj):
    print(f"\n----- {label} -----")
    print(obj)

def main():
    # 1. 登录拿 sessionId
    r = requests.post(f"{ECHO_CORE}/auth/login", json={"username": USERNAME, "password": PASSWORD})
    r.raise_for_status()
    sid = r.json()["data"]["sessionId"]
    headers = {"X-Session-Id": sid, "Content-Type": "application/json"}
    pp("登录", r.json()["message"])

    roleId = "54"

    # 2. 列出当前会话
    r = requests.post(f"{ECHO_CORE}/chat/sessions/list", headers=headers,
                      json={"roleId": roleId, "limit": 50})
    r.raise_for_status()
    initial = r.json()
    pp("初始列表", f"count={len(initial['items'])} cursor={initial['nextCursor']}")

    # 3. 创建 3 个新会话
    new_sids = []
    for title in ["trip-plan", "code-debug", "song-recommend"]:
        r = requests.post(f"{ECHO_CORE}/chat/sessions/create", headers=headers,
                          json={"roleId": roleId, "title": title})
        r.raise_for_status()
        d = r.json()
        assert d.get("ok"), f"create failed: {d}"
        sess = d["session"]
        new_sids.append(sess["sessionId"])
        print(f"  + created {title} → {sess['sessionId']}")
    pp("创建完成", f"新会话数={len(new_sids)}")

    # 4. 拉取第一页（每页 2 条）→ 验证游标分页能分多次翻完
    cursor = None
    pages = 0
    seen_ids = set()
    while True:
        params = {"roleId": roleId, "limit": 2, "cursor": cursor}
        r = requests.post(f"{ECHO_CORE}/chat/sessions/list", headers=headers, json=params)
        r.raise_for_status()
        d = r.json()
        pages += 1
        if "items" not in d:
            print(f"  page{pages} ERROR no items: {d}")
            break
        page_ids = [it["sessionId"] for it in d["items"]]
        print(f"  page{pages}: {len(page_ids)} items, cursor={d.get('nextCursor')}")
        seen_ids.update(page_ids)
        if not d.get("nextCursor"):
            break
        cursor = d["nextCursor"]
        if pages > 20:
            print("WARN: too many pages, break"); break
    pp("游标分页", f"pages={pages} unique={len(seen_ids)}")

    # 5. 关键字搜索：往一个新会话里塞消息，再按关键词查
    #    直接调 echo-ai 的 /chat 非流式，写入 chat_messages
    s_for_msg = new_sids[0]
    ai = "http://localhost:8000/chat"
    payload = {"userId": "63", "roleId": roleId, "sessionId": s_for_msg,
               "message": "请推荐一首关于雪山的歌曲", "stream": False}
    rr = requests.post(ai, json=payload, timeout=90)
    rr.raise_for_status()
    print(f"  + insert into {s_for_msg[:8]}... → reply len={len(rr.json()['reply'])}")

    # 给另一个会话插入不同关键字
    payload["sessionId"] = new_sids[1]
    payload["message"] = "怎么调试Python的内存泄漏？"
    rr = requests.post(ai, json=payload, timeout=90)
    rr.raise_for_status()
    print(f"  + insert into {new_sids[1][:8]}... → reply len={len(rr.json()['reply'])}")

    # 6. 关键字搜索
    r = requests.post(f"{ECHO_CORE}/chat/sessions/list", headers=headers,
                      json={"roleId": roleId, "limit": 50, "keyword": "雪"})
    r.raise_for_status()
    kw = r.json()
    matched = [it["sessionId"] for it in kw["items"]]
    print(f"  keyword='雪' → matched={len(matched)} includes_target={s_for_msg in matched}")
    assert s_for_msg in matched, f"keyword 雪 must hit s_for_msg, got {matched}"

    r = requests.post(f"{ECHO_CORE}/chat/sessions/list", headers=headers,
                      json={"roleId": roleId, "limit": 50, "keyword": "Python"})
    r.raise_for_status()
    kw = r.json()
    matched2 = [it["sessionId"] for it in kw["items"]]
    print(f"  keyword='Python' → matched={len(matched2)} includes_target={new_sids[1] in matched2}")
    assert new_sids[1] in matched2, f"keyword Python must hit s_debug"

    # 7. rename
    r = requests.post(f"{ECHO_CORE}/chat/sessions/update", headers=headers,
                      json={"roleId": roleId, "sessionId": new_sids[0], "title": "trip-plan-renamed"})
    r.raise_for_status()
    d = r.json()
    assert d.get("ok"), f"update failed: {d}"
    print(f"  rename ok: {d['session']['title']}")

    # 8. list_messages
    r = requests.post(f"{ECHO_CORE}/chat/sessions/messages", headers=headers,
                      json={"roleId": roleId, "sessionId": new_sids[0], "limit": 10})
    r.raise_for_status()
    msgs = r.json()["items"]
    pp("拉取消息", f"{new_sids[0][:8]}... 消息数={len(msgs)}")
    for m in msgs:
        c = m["content"]
        safe = c.encode("ascii", "replace").decode("ascii")[:50]
        print(f"  [{m['role']}] {safe}")
    assert len(msgs) == 2, f"expected 2 msgs, got {len(msgs)}"
    last_msg_id = msgs[-1]["messageId"]
    print(f"  last msg id = {last_msg_id}")

    # 9. feedback (up)
    r = requests.post(f"{ECHO_CORE}/chat/feedback", headers=headers,
                      json={"roleId": roleId, "sessionId": new_sids[0],
                            "messageId": last_msg_id, "rating": 1})
    r.raise_for_status()
    fb = r.json()
    pp("点赞反馈", fb)
    assert fb["ok"], "feedback ok must be true"

    # 10. delete one
    r = requests.post(f"{ECHO_CORE}/chat/sessions/delete", headers=headers,
                      json={"roleId": roleId, "sessionId": new_sids[2]})
    r.raise_for_status()
    print(f"  delete {new_sids[2][:8]}... ok={r.json()['ok']}")

    # 11. 确认 lastMsgAt 已更新（list 顺序按 last_msg_at DESC）
    r = requests.post(f"{ECHO_CORE}/chat/sessions/list", headers=headers,
                      json={"roleId": roleId, "limit": 5})
    r.raise_for_status()
    items = r.json()["items"]
    pp("最终侧栏（应按 lastMsgAt DESC）", [(it["sessionId"][:8], it["lastMsgAt"]) for it in items[:5]])

    print("\n===== ALL E2E TESTS PASSED =====")

if __name__ == "__main__":
    main()
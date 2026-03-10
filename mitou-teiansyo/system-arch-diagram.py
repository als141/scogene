"""
Scogene システムアーキテクチャ図
Python diagrams (mingrammer) で生成
"""
from diagrams import Cluster, Diagram, Edge
from diagrams.gcp.compute import Run
from diagrams.programming.framework import NextJs, Vercel
from diagrams.onprem.client import Users
from diagrams.custom import Custom

# アイコンパス
ICONS = "icons/png"

graph_attr = {
    "fontsize": "14",
    "fontname": "Noto Sans CJK JP",
    "bgcolor": "white",
    "pad": "0.5",
    "nodesep": "0.8",
    "ranksep": "1.2",
    "splines": "ortho",
}

node_attr = {
    "fontsize": "11",
    "fontname": "Noto Sans CJK JP",
}

edge_attr = {
    "fontsize": "10",
    "fontname": "Noto Sans CJK JP",
    "fontcolor": "#888888",
}

with Diagram(
    "Scogene - システムアーキテクチャ",
    filename="system-arch-py",
    outformat="svg",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    # ================================================================
    # ユーザー
    # ================================================================
    with Cluster("ユーザー", graph_attr={"bgcolor": "#F5F5F5", "style": "rounded", "pencolor": "#CCCCCC"}):
        teacher = Users("塾講師\nFB確認・解説指導")
        student = Users("生徒\n答案撮影・問題演習")

    # ================================================================
    # フロントエンド
    # ================================================================
    with Cluster("フロントエンド", graph_attr={"bgcolor": "#F0F7FF", "style": "rounded", "pencolor": "#BDD7EE", "fontcolor": "#1A5276"}):
        nextjs = NextJs("Next.js\nTypeScript / React")
        vercel = Vercel("Vercel\nホスティング / Edge")
        clerk = Custom("Clerk\n認証 / ユーザー管理", f"{ICONS}/clerk.png")

    # ================================================================
    # バックエンド
    # ================================================================
    with Cluster("バックエンド - Google Cloud", graph_attr={"bgcolor": "#F0FDF4", "style": "rounded", "pencolor": "#A7F3D0", "fontcolor": "#059669"}):
        cloud_run = Run("Cloud Run\nPython + Go")

        with Cluster("エンジン群", graph_attr={"bgcolor": "#FFFFFF", "style": "rounded,dashed", "pencolor": "#10B981"}):
            grade_engine = Custom("採点エンジン\n手書き答案→エラー分類", f"{ICONS}/postgresql.png")
            gen_engine = Custom("問題生成エンジン\n苦手特化 / 模試対策", f"{ICONS}/postgresql.png")
            adapt_engine = Custom("適応学習エンジン\nBKT / FSRS / 知識グラフ", f"{ICONS}/postgresql.png")

    # ================================================================
    # AI / LLM
    # ================================================================
    with Cluster("AI / LLM", graph_attr={"bgcolor": "#FFF7ED", "style": "rounded", "pencolor": "#FED7AA", "fontcolor": "#C2410C"}):
        openai = Custom("OpenAI\nAgents SDK", f"{ICONS}/openai.png")

        with Cluster("Agent群", graph_attr={"bgcolor": "#FFFFFF", "style": "rounded,dashed", "pencolor": "#F59E0B"}):
            score_agent = Custom("採点 Agent\nGPT + Vision", f"{ICONS}/openai.png")
            gen_agent = Custom("問題生成 Agent\nCode Interpreter", f"{ICONS}/openai.png")
            fb_agent = Custom("FB生成 Agent\n教師向けレポート", f"{ICONS}/openai.png")

    # ================================================================
    # データ基盤
    # ================================================================
    with Cluster("データ基盤", graph_attr={"bgcolor": "#FAF5FF", "style": "rounded", "pencolor": "#DDD6FE", "fontcolor": "#7C3AED"}):
        supabase = Custom("Supabase\nPostgreSQL + Storage", f"{ICONS}/supabase.png")

        with Cluster("データストア", graph_attr={"bgcolor": "#FFFFFF", "style": "rounded,dashed", "pencolor": "#8B5CF6"}):
            prob_db = Custom("問題 DB\nIRT較正 / 誤答パターン", f"{ICONS}/postgresql.png")
            student_profile = Custom("生徒プロファイル\n苦手 / 知識状態 / 履歴", f"{ICONS}/postgresql.png")
            pgvector = Custom("pgvector\n埋め込みベクトル検索", f"{ICONS}/postgresql.png")

    # ================================================================
    # メインフロー
    # ================================================================
    main_edge = Edge(color="#555555", style="bold", label="")

    teacher >> Edge(color="#555555", style="bold", label="HTTPS") >> nextjs
    student >> Edge(color="#555555", style="bold") >> nextjs

    nextjs >> Edge(color="#555555", style="bold", label="REST / SSE") >> cloud_run
    vercel - Edge(color="#DDDDDD", style="dashed") - nextjs
    clerk - Edge(color="#DDDDDD", style="dashed") - nextjs

    cloud_run >> Edge(color="#555555", style="bold", label="API") >> openai

    openai >> Edge(color="#555555", style="bold", label="読み書き") >> supabase

    # ================================================================
    # エンジン → Agent の対応関係（破線）
    # ================================================================
    grade_engine >> Edge(color="#AAAAAA", style="dashed") >> score_agent
    gen_engine >> Edge(color="#AAAAAA", style="dashed") >> gen_agent
    adapt_engine >> Edge(color="#AAAAAA", style="dashed") >> fb_agent

    # ================================================================
    # Agent → データストアの対応関係（破線）
    # ================================================================
    score_agent >> Edge(color="#AAAAAA", style="dashed") >> prob_db
    gen_agent >> Edge(color="#AAAAAA", style="dashed") >> student_profile
    fb_agent >> Edge(color="#AAAAAA", style="dashed") >> pgvector

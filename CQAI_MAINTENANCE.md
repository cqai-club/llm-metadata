# CQAI 模型目录维护

本仓库同步 BaseLLM 模型目录，并通过 `data/overrides/` 保存 CQAI 自有模型和修正信息。`dist/api/` 下的文件均为构建产物，由 GitHub Actions 自动更新。

## 新增或更新模型

创建或编辑：

```text
data/overrides/models/<provider-id>/<model-id>.json
```

模型 ID 必须与供应商返回或 Relay 渠道配置的名称完全一致。最小模型文件如下：

```json
{
  "$comment": "资料来源：https://provider.example/model-docs",
  "id": "provider-model-id",
  "name": "模型名称",
  "description": "简短且可核实的模型描述。",
  "modalities": {
    "input": ["text"],
    "output": ["text"]
  }
}
```

多语言名称和描述放在：

```text
data/overrides/i18n/models/<provider-id>/<model-id>.json
```

可维护字段包括 `reasoning`、`tool_call`、`attachment`、`temperature`、`open_weights`、`release_date`、`last_updated`、`modalities`、`limit` 和 `cost`。请在 `$comment` 中保留官方资料地址；该字段只保留在源文件中，不会进入生成的 API。

## 校验改动

```bash
npm ci
npm run validate:overrides
npm run build
```

校验器会拒绝错误的 JSON、未支持字段、与文件名不一致的模型 ID、错误的模态、限制值和日期。

改动进入 `main` 后，构建工作流会发布：

```text
/api/newapi/models.json
/api/newapi/vendors.json
/api/all.json
/api/i18n/{en,zh,ja}/newapi/models.json
/api/i18n/{en,zh,ja}/newapi/vendors.json
```

发布完成后，在 CQAI Relay 中先预览上游同步，再应用更新。请求路由、Task Plugin 协议、视频时长与分辨率校验以及计费策略继续由 Relay 维护；本仓库只作为模型元数据源。

## 下架模型

先在 Relay 渠道中停用模型，再删除模型和 i18n 覆盖文件。仅从目录删除模型不会自动停用 Relay 中已经配置的模型。

## 合并上游更新

```bash
git remote add upstream https://github.com/basellm/llm-metadata.git
git fetch upstream
git merge upstream/main
```

解决 CQAI 覆盖文件中的冲突后，重新运行校验和构建，再推送合并结果。

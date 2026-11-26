# Read the API logs with docker logs (#73)

`docker compose logs api` fails on the server with "required variable GITHUB_CLIENT_SECRET is missing a value": Compose interpolates every `${VAR:?}` in `compose.yaml`, and the secrets come from SSM only inside `deploy/deploy.sh`.

| File        | Change                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` | The request-log and sign-in-record examples use `docker logs shared-auth-api-1 2>&1`, with one line on why. The new sign-in alert check gets the same command. |

`deploy/remote-deploy.sh` also calls `docker compose logs`, but it runs inside the deploy where the secrets are loaded, and it is a managed file, so it is unchanged.

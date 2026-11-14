// Returns a traceable error response with no internal exception detail.
namespace PharmacyAPI.Middlewares;

public class ExceptionHandlerMiddleware(RequestDelegate next, ILogger<ExceptionHandlerMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // The disconnected client can no longer receive a response.
        }
        catch (Exception exception)
        {
            logger.LogError("Unhandled {ExceptionType} for {Method}. Trace {TraceId}",
                exception.GetType().Name, context.Request.Method, context.TraceIdentifier);
            if (context.Response.HasStarted) throw;
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new
            {
                message = "An unexpected error occurred.",
                traceId = context.TraceIdentifier
            });
        }
    }
}

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sompriti.Erp.Application.Auth;
using Sompriti.Erp.Application.Billing;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Application.MasterData;
using Sompriti.Erp.Application.Orders;
using Sompriti.Erp.Application.Platform;
using Sompriti.Erp.Application.Posts;
using Sompriti.Erp.Application.Reports;
using Sompriti.Erp.Application.Settings;
using Sompriti.Erp.Application.Sms;
using Sompriti.Erp.Application.Stock;
using Sompriti.Erp.Application.Users;

namespace Sompriti.Erp.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<AuthOptions>(config.GetSection(AuthOptions.Section));
        services.Configure<AppOptions>(config.GetSection(AppOptions.Section));
        services.AddSingleton(TimeProvider.System);

        services.AddScoped<IBusinessProfile, BusinessProfile>();
        services.AddScoped<PdfMailer>();
        services.AddScoped<AuthService>();
        services.AddScoped<AccountDeletionService>();
        services.AddScoped<UserService>();
        services.AddScoped<CompanyService>();
        services.AddScoped<CustomerService>();
        services.AddScoped<SupplierService>();
        services.AddScoped<ProductService>();
        services.AddScoped<StockService>();
        services.AddScoped<PurchaseOrderService>();
        services.AddScoped<SalesOrderService>();
        services.AddScoped<ReportService>();
        services.AddScoped<SmsService>();
        services.AddScoped<PlatformService>();
        services.AddScoped<BusinessSettingsService>();
        services.AddMemoryCache();
        services.AddSingleton<BillingSettingsCache>();
        services.AddSingleton<SubscriptionLedger>();
        services.AddScoped<BillingService>();
        services.AddScoped<PlatformBillingService>();
        services.AddScoped<PostService>();
        return services;
    }
}

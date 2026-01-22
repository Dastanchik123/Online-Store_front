export const useSeo = () => {
  const config = useRuntimeConfig();

  const setSeo = (options: {
    title?: string;
    description?: string;
    keywords?: string;
    image?: string;
    url?: string;
    type?: string;
    author?: string;
    publishedTime?: string;
    modifiedTime?: string;
  }) => {
    const route = useRoute();
    const baseUrl =
      config.public.apiBase?.replace("/api", "") ||
      "https://online-store-back.onrender.com";

    const defaultTitle = "KurulushStore - Интернет-магазин";
    const defaultDescription =
      "Лучший интернет-магазин с широким ассортиментом товаров по выгодным ценам. Быстрая доставка, гарантия качества.";
    const defaultImage = `${baseUrl}/og-image.jpg`;

    const title = options.title
      ? `${options.title} | KurulushStore`
      : defaultTitle;
    const description = options.description || defaultDescription;
    const keywords =
      options.keywords || "интернет-магазин, купить онлайн, доставка";
    const image = options.image || defaultImage;
    const url = options.url || `${baseUrl}${route.path}`;
    const type = options.type || "website";

    useHead({
      title,
      meta: [
        { name: "description", content: description },
        { name: "keywords", content: keywords },
        { name: "author", content: options.author || "KurulushStore" },

        { property: "og:type", content: type },
        { property: "og:url", content: url },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:site_name", content: "KurulushStore" },
        { property: "og:locale", content: "ru_RU" },

        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },

        { name: "robots", content: "index, follow" },
        { name: "googlebot", content: "index, follow" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { "http-equiv": "Content-Type", content: "text/html; charset=utf-8" },

        ...(options.publishedTime
          ? [
              {
                property: "article:published_time",
                content: options.publishedTime,
              },
            ]
          : []),
        ...(options.modifiedTime
          ? [
              {
                property: "article:modified_time",
                content: options.modifiedTime,
              },
            ]
          : []),
        ...(options.author
          ? [{ property: "article:author", content: options.author }]
          : []),
      ],
      link: [
        { rel: "canonical", href: url },
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/apple-touch-icon.png",
        },
      ],
      script: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": type === "article" ? "Article" : "WebSite",
            name: title,
            description: description,
            url: url,
            image: image,
            ...(type === "article" && options.publishedTime
              ? {
                  datePublished: options.publishedTime,
                  dateModified: options.modifiedTime || options.publishedTime,
                  author: {
                    "@type": "Person",
                    name: options.author || "KurulushStore",
                  },
                }
              : {}),
          }),
        },
      ],
    });
  };

  const setProductSeo = (product: any) => {
    const config = useRuntimeConfig();
    const baseUrl =
      config.public.apiBase?.replace("/api", "") ||
      "https://online-store-back.onrender.com";

    const price = product.sale_price || product.price;
    const availability = product.stock_quantity > 0 ? "InStock" : "OutOfStock";

    setSeo({
      title: product.name,
      description:
        product.description?.substring(0, 160) ||
        `Купить ${product.name} в интернет-магазине KurulushStore`,
      keywords: `${product.name}, купить ${product.name}, ${
        product.category?.name || ""
      }`,
      image: product.images?.[0]?.url || product.image_url,
      type: "product",
    });

    useHead({
      script: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description,
            image: product.images?.map((img: any) => img.url) || [
              product.image_url,
            ],
            sku: product.sku || product.id,
            brand: {
              "@type": "Brand",
              name: "KurulushStore",
            },
            offers: {
              "@type": "Offer",
              url: `${baseUrl}/product/${product.slug || product.id}`,
              priceCurrency: "KGS",
              price: price,
              availability: `https://schema.org/${availability}`,
              seller: {
                "@type": "Organization",
                name: "KurulushStore",
              },
            },
            aggregateRating:
              product.reviews_count > 0
                ? {
                    "@type": "AggregateRating",
                    ratingValue: product.average_rating || 5,
                    reviewCount: product.reviews_count || 0,
                  }
                : undefined,
          }),
        },
      ],
    });
  };

  const setBreadcrumbs = (items: Array<{ name: string; url: string }>) => {
    const config = useRuntimeConfig();
    const baseUrl =
      config.public.apiBase?.replace("/api", "") ||
      "https://online-store-back.onrender.com";

    useHead({
      script: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: items.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.name,
              item: `${baseUrl}${item.url}`,
            })),
          }),
        },
      ],
    });
  };

  return {
    setSeo,
    setProductSeo,
    setBreadcrumbs,
  };
};
